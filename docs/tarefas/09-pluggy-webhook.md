# 09 — Webhook da Pluggy

**Prioridade:** 🟡
**Donos:** QA (teste) → Backend
**Status:** BLOQUEADA até 03 (URL pública HTTPS) e 08 (sincronização reaproveitável por sistema).
**Branch sugerida:** `feat/pluggy-webhook`

## Problema

`PLUGGY_WEBHOOK_SECRET` existe no `.env.example` e no `env.ts:65`, mas não há endpoint.
O Meister não fica sabendo quando a Pluggy termina de atualizar um item, quando o consentimento
expira ou quando a conexão dá erro. A conexão continua "ativa" na tela mesmo quebrada.

## O que fazer

1. Leia a documentação de webhooks da Pluggy: lista de eventos (ex.: `item/updated`, `item/error`,
   `item/login_succeeded`, `transactions/created`, `transactions/deleted`, `connector/status_updated`),
   formato do corpo e **como autenticar a origem**. Se a Pluggy permitir cabeçalhos customizados no
   cadastro do webhook, use um cabeçalho com `PLUGGY_WEBHOOK_SECRET`. Registre no PR qual mecanismo
   a doc oferece.
2. Rota `POST /api/openfinance/webhook`, fora do `authMiddleware`, em arquivo próprio + uma linha no `app.ts`:
   - Valida o segredo em tempo constante → 401 se errado; 404 se `PLUGGY_WEBHOOK_SECRET` vazio.
   - Valida o corpo com Zod.
   - Responde **2xx rápido** e processa fora do ciclo da requisição (ou de forma curta e idempotente).
     A Pluggy reenvia em caso de falha.
   - Localiza a `BankConnection` pelo `itemId` (sem `WorkspaceScope` de usuário: use o scope de
     sistema da tarefa 08). `itemId` desconhecido → 2xx e ignora (não revelar nada).
   - `item/updated` / `transactions/created` → roda a sincronização daquela conexão.
   - `item/error` / consentimento expirado → `status: 'erro'`, `lastError` genérico, `consentExpiresAt` se vier.
   - `transactions/deleted` → marcar `BankTransaction` correspondente (definir com o dono se
     ignora ou remove da Caixa de Revisão; lançamento já aprovado no ledger **não** é apagado).
3. Idempotência: o mesmo evento recebido duas vezes não duplica nada (a unicidade
   `provider_externalId` já protege as transações; garanta o mesmo para mudanças de status).
4. Documente em `docs/openfinance.md` como cadastrar a URL do webhook no painel da Pluggy
   (`https://<dominio>/api/openfinance/webhook`).
5. OpenAPI atualizado. Não logue o corpo do webhook.

## Teste que deve falhar antes

Integração (`backend/tests/openfinance-webhook.integration.test.ts`):

- Sem segredo / segredo errado → 401. Segredo não configurado → 404.
- Corpo inválido → 400.
- `item/error` para item conhecido → conexão com `status: 'erro'`.
- `item/updated` → aggregator falso recebe as chamadas de busca; enviar duas vezes → sem duplicatas.
- `itemId` desconhecido → 2xx, nada alterado no banco.

## Critério de pronto

- [ ] Testes falharam antes e passam depois.
- [ ] Webhook cadastrado no painel da Pluggy de produção e recebendo eventos (anotar no PR).
- [ ] Tabela do `README.md` desta pasta atualizada.
