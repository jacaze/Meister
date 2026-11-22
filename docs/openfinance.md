# Open Finance (Pluggy)

Como o MEIster importa extratos bancários pela Pluggy, como configurar e como testar com conta real.

## Variáveis de ambiente

| Variável | Obrigatória | O que é |
|---|---|---|
| `PLUGGY_CLIENT_ID` | não (sem ela o Open Finance fica desligado) | Client ID da aplicação no painel da Pluggy |
| `PLUGGY_CLIENT_SECRET` | junto com o ID | Client Secret da mesma aplicação |
| `PLUGGY_BASE_URL` | não | Só para apontar para um servidor simulado em dev. Vazia = `https://api.pluggy.ai` |
| `PLUGGY_WEBHOOK_SECRET` | não (desabilita webhook se vazia) | Signing secret (`whsec_...`) da Pluggy (padrão recomendado) ou segredo estático (mín. 32 chars em prod/staging) |

Validação no boot (`backend/src/shared/env.ts`), fora de `development`/`test`:

- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` vêm juntas ou nenhuma. Só uma preenchida derruba o boot.
- `PLUGGY_BASE_URL`, se preenchida, precisa ser `https://`. Em qualquer ambiente precisa ser URL completa.
- `PLUGGY_WEBHOOK_SECRET`, se preenchida, precisa ter pelo menos 32 caracteres e não usar valores padrão de exemplo.

As credenciais ficam só no `.env` do servidor. Não existe rota para trocá-las pela aplicação
(`POST /api/openfinance/config` responde 404 de propósito).

## Sandbox × conta real

Não há "modo sandbox" no código:

- O backend sempre chama a API real da Pluggy (`https://api.pluggy.ai`).
- O widget lista os bancos de teste (Pluggy Bank) no dev server e, em produção, só se o build for feito com
  `VITE_PLUGGY_INCLUDE_SANDBOX=true` (demo hospedada; ver `docs/deploy.md`). Leitura centralizada em
  `frontend/src/lib/pluggyConfig.ts`; o modal é `frontend/src/components/openfinance/PluggyConnectFallbackModal.tsx`.
- **Quem decide se uma conta real conecta é a aplicação no painel da Pluggy** cujas credenciais estão no `.env`.

### Caminho A — testar com a sua própria conta, sem custo (MeuPluggy)

O conector **MeuPluggy** lê as suas próprias contas pela API, sem due diligence.

1. Com o **trial da Pluggy ativo** (só é possível vincular durante o trial), crie conta em
   <https://meu.pluggy.ai> e conecte lá o seu banco real.
2. Coloque no `.env` as credenciais da aplicação do trial e suba o MEIster.
3. No app: **Revisão → Conectar banco**.
4. No widget, escolha o conector **MeuPluggy** e autorize.
5. As contas e transações dos últimos 90 dias caem na **Caixa de Revisão** (`status: nova`). Nada vai para
   os lançamentos sem aprovação.

O MeuPluggy funciona como proxy da conexão original e atualiza os dados uma vez por dia.

### Caminho B — clientes reais (aplicação de produção)

1. No painel da Pluggy: **Applications → Go to production**. Envolve contrato e due diligence com a Pluggy.
2. Coloque as novas credenciais **só** no `.env` de produção.
3. Cadastre o webhook no painel da Pluggy apontando para `https://<dominio>/api/openfinance/webhook` (veja a seção [Webhook da Pluggy](#webhook-da-pluggy)).

## Fluxo

```
Frontend                         Backend                                Pluggy
   │ POST /api/openfinance/connect-token ─▶ POST /auth, POST /connect_token
   │                                        (clientUserId = id do usuário)
   │ ◀── accessToken ───────────────────────
   │ abre o widget com o token  ─────────────────────────────────────────▶ usuário autoriza o banco
   │ ◀── onSuccess({ item.id }) ──────────────────────────────────────────
   │ POST /api/openfinance/connect-item { itemId } ─▶ GET /items/{id}
   │                                        confere item.clientUserId = usuário (senão 404)
   │                                        GET /accounts, GET /v2/transactions (90 dias)
   │ ◀── 201 { importedTransactionsCount, ... }
```

Detalhes que importam:

- **Dono do item:** uma conexão nova só é criada se o `clientUserId` do item for o usuário autenticado e o
  item não estiver em outro workspace. Item de outro usuário, sem dono ou inexistente responde **404**.
- **De quem é cada conta:** conta nova entra sem entidade quando o workspace tem mais de uma entidade (PJ, autônomo...); com só a PF, vai direto para ela.
  A resposta do `connect-item` traz `accounts` e o app pergunta "De quem são estas contas?". Aprovar item de conta sem
  entidade responde 400 `ACCOUNT_ENTITY_REQUIRED`. Trocar a entidade depois afeta só o que ainda está na Caixa de Revisão.
- **De quem é o gasto × de onde saiu:** a aprovação usa a entidade da conta como pagadora. Aprovar o item em outra
  entidade (ex.: compra no cartão pessoal que é da empresa) gera um acerto (tarefa 18).
- **Duplicatas:** transação já importada (mesmo `provider` + `externalId`) é pulada.
- **Transferências entre contas próprias** são marcadas como suspeitas (`isTransferSuspect`) para revisão.
- **Sincronizar:** `POST /api/openfinance/connections/:id/sync` pede atualização à Pluggy e reimporta os
  últimos 45 dias. A rotina interna agendada (`/api/internal/tick`, a cada `OPENFINANCE_SYNC_INTERVAL_HOURS`, padrão 12 h)
  e o webhook (`POST /api/openfinance/webhook`) também mantêm as conexões atualizadas automaticamente.

## Webhook da Pluggy

O endpoint público `POST /api/openfinance/webhook` (contrato em [openfinance-webhook.openapi.yaml](api/openfinance-webhook.openapi.yaml))
responde `202 Accepted` rapidamente (dentro do limite de 10 s da Pluggy) e processa cada evento em segundo plano, de forma serializada por `itemId` e idempotente.
Quando `PLUGGY_WEBHOOK_SECRET` não está configurado (ou contém apenas espaços), o endpoint responde `404`. Falhas de assinatura ou segredo respondem `401` (que a Pluggy não reenvia).

### Configuração recomendada no painel da Pluggy (Signing Secret)

1. No painel da Pluggy, acesse **Applications → Configure → Webhooks** e gere o **Webhook Signing Secret** (formato `whsec_<hex>`).
2. Defina `PLUGGY_WEBHOOK_SECRET` no `.env` de produção com esse signing secret completo e reinicie a API.
3. Cadastre a URL pública `https://<dominio>/api/openfinance/webhook` selecionando os eventos desejados (ou `all`).
4. **Regra de segurança:** quando `PLUGGY_WEBHOOK_SECRET` começa com `whsec_`, o backend **exige** o cabeçalho `X-Pluggy-Signature: t=<unix>,v1=<hmac_sha256>` validado em tempo constante sobre `<t>.<rawBody>` com janela anti-replay de ±5 minutos — **sem fallback** para cabeçalhos estáticos.

### Alternativa: cabeçalho customizado estático

Se cadastrar um webhook via API (`POST /webhooks`) com `headers` customizados e optar por um segredo estático (não iniciado por `whsec_`, mínimo 32 caracteres em produção/staging), o backend aceita comparação em tempo constante em `X-Webhook-Secret`, `X-Pluggy-Webhook-Secret` ou `Authorization: Bearer <segredo>`.

> [!IMPORTANT]
> Conforme a documentação oficial da Pluggy (*Webhook Security*), cabeçalhos customizados **não** são enviados para `webhookUrl` configurado diretamente em um *Item* ou *Connect Token*. Prefira sempre o **Signing Secret (`whsec_...`)** com `X-Pluggy-Signature`.

### Eventos tratados e proteções

- `item/updated`, `item/created`, `transactions/created`, `transactions/updated`: reconsultam item, contas e transações dos últimos 45 dias na API autenticada da Pluggy **sem** acionar `syncItem` de volta (evita loop infinito de webhooks).
- `item/error` e `item/waiting_user_input`: marcam a conexão com `status: 'erro'`, mensagem genérica segura (sem gravar texto bruto do payload) e atualizam `consentExpiresAt` quando informado.
- `item/login_succeeded`: muda conexão em `erro` para `atualizando` limpando `lastError`.
- `item/deleted`: marca a conexão como `revogada` (estado terminal; eventos posteriores são ignorados).
- `transactions/deleted`: marca apenas transações pendentes na Caixa de Revisão (`status` `nova` ou `casada`) dessa conexão como `removida`. Lançamentos já aprovados (`importada`) e registros do ledger (`transactions`) **nunca** são alterados ou apagados.
- **Privacidade e recuperação:** o corpo bruto e cabeçalhos do webhook nunca são gravados nos logs; `itemId` desconhecido retorna `202` sem alterar o banco; eventual evento recebido imediatamente antes de um restart do container da API é recuperado pela rotina periódica (`/api/internal/tick`, a cada `OPENFINANCE_SYNC_INTERVAL_HOURS`).

## Rotas

| Método e rota | O que faz |
|---|---|
| `GET /api/openfinance/config` | `{ hasCredentials }`: se o Open Finance está configurado |
| `POST /api/openfinance/connect-token` | Gera o token do widget para o usuário logado |
| `POST /api/openfinance/connect-item` | Vincula o item devolvido pelo widget e importa |
| `GET /api/openfinance/connections` | Lista as conexões do workspace |
| `POST /api/openfinance/connections/:id/sync` | Sincroniza uma conexão |
| `POST /api/openfinance/webhook` | Receptor autenticado de webhooks da Pluggy (`202 Accepted`) |
| `PATCH /api/openfinance/bank-accounts/:id` | Diz de qual entidade (pessoal ou empresa) é a conta: `{ entityId }` |
| `DELETE /api/openfinance/connections/:id` | Remove a conexão do MEIster |
| `GET /api/imports` | Caixa de Revisão |
| `POST /api/imports/approve`, `/batch-approve`, `/ignore` | Aprovar ou ignorar itens importados |
| `POST /api/imports/statement` | Importar OFX/CSV manualmente (sem Pluggy) |
| `PUT /api/transactions/:id/non-income` | Marca uma receita como "não é renda" (`{ reason: 'own_account' \| 'refund' }`) ou desfaz (`{ reason: null }`) |

### Entrada que não é renda

Na Caixa de Revisão, uma **entrada** pendente pode ser aprovada como "Não é renda" (`POST /api/imports/approve`
com `nonIncomeReason`): `own_account` = veio de outra conta do próprio usuário (banco não conectado);
`refund` = reembolso ou devolução. O ledger grava a receita como **perna única de transferência**
(`transfer_group_id` próprio + `transfer_type` = motivo). Com isso ela continua na lista de lançamentos
(com o selo "Não é renda"), mas fica fora da receita do mês (dashboard, totais de lançamentos, insights e resumo do mês),
da base dos potes e do faturamento do limite MEI — o mesmo critério que já valia para transferências.
Saída não pode ser marcada (`400 NON_INCOME_ONLY_FOR_INCOME`); perna de transferência ou pró-labore também
não (`400 NON_INCOME_TRANSFER_LEG`). Em Lançamentos, a mesma rota do ledger marca, troca o motivo ou desfaz,
com registro em `transaction_audit`.

## Limitações conhecidas

- `DELETE /api/openfinance/connections/:id` remove a conexão só no MEIster; o item continua existindo na
  Pluggy (o consentimento não é revogado lá).
- Importação que não conclui (erro da Pluggy ou mais de 200 páginas por conta) não grava nada: a conexão
  fica com `status: 'erro'` e a próxima sincronização tenta de novo.
- Valores convertidos com float (tarefa 07).
