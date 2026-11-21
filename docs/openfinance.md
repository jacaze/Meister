# Open Finance (Pluggy)

Como o MEIster importa extratos bancários pela Pluggy, como configurar e como testar com conta real.

## Variáveis de ambiente

| Variável | Obrigatória | O que é |
|---|---|---|
| `PLUGGY_CLIENT_ID` | não (sem ela o Open Finance fica desligado) | Client ID da aplicação no painel da Pluggy |
| `PLUGGY_CLIENT_SECRET` | junto com o ID | Client Secret da mesma aplicação |
| `PLUGGY_BASE_URL` | não | Só para apontar para um servidor simulado em dev. Vazia = `https://api.pluggy.ai` |
| `PLUGGY_WEBHOOK_SECRET` | não | Reservada para o webhook (tarefa 09), ainda sem uso |

Validação no boot (`backend/src/shared/env.ts`), fora de `development`/`test`:

- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` vêm juntas ou nenhuma. Só uma preenchida derruba o boot.
- `PLUGGY_BASE_URL`, se preenchida, precisa ser `https://`. Em qualquer ambiente precisa ser URL completa.

As credenciais ficam só no `.env` do servidor. Não existe rota para trocá-las pela aplicação
(`POST /api/openfinance/config` responde 404 de propósito).

## Sandbox × conta real

Não há "modo sandbox" no código:

- O backend sempre chama a API real da Pluggy (`https://api.pluggy.ai`).
- O widget só lista os bancos de teste no dev server (`includeSandbox={import.meta.env.DEV}` em
  `frontend/src/components/openfinance/PluggyConnectFallbackModal.tsx`). No build de produção eles somem.
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
3. Cadastre o webhook (tarefa 09, quando existir).

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
- **Duplicatas:** transação já importada (mesmo `provider` + `externalId`) é pulada.
- **Transferências entre contas próprias** são marcadas como suspeitas (`isTransferSuspect`) para revisão.
- **Sincronizar:** `POST /api/openfinance/connections/:id/sync` pede atualização à Pluggy e reimporta os
  últimos 45 dias. Ainda não há sincronização automática (tarefa 08) nem webhook (tarefa 09).

## Rotas

| Método e rota | O que faz |
|---|---|
| `GET /api/openfinance/config` | `{ hasCredentials }`: se o Open Finance está configurado |
| `POST /api/openfinance/connect-token` | Gera o token do widget para o usuário logado |
| `POST /api/openfinance/connect-item` | Vincula o item devolvido pelo widget e importa |
| `GET /api/openfinance/connections` | Lista as conexões do workspace |
| `POST /api/openfinance/connections/:id/sync` | Sincroniza uma conexão |
| `DELETE /api/openfinance/connections/:id` | Remove a conexão do MEIster |
| `GET /api/imports` | Caixa de Revisão |
| `POST /api/imports/approve`, `/batch-approve`, `/ignore` | Aprovar ou ignorar itens importados |
| `POST /api/imports/statement` | Importar OFX/CSV manualmente (sem Pluggy) |

## Limitações conhecidas

- `DELETE /api/openfinance/connections/:id` remove a conexão só no MEIster; o item continua existindo na
  Pluggy (o consentimento não é revogado lá).
- Importação de contas com muitas transações pode vir cortada (tarefa 06).
- Valores convertidos com float (tarefa 07).
