# 06 — Paginação da Pluggy sem corte silencioso

**Prioridade:** 🟡
**Donos:** QA (teste) → Backend
**Branch sugerida:** `fix/pluggy-paginacao`

## Problema

`PluggyClient.fetchTransactions` para depois de **10 páginas** (`maxPages = 10`) e devolve o que
juntou **como se fosse tudo**. Uma conta com muito movimento nos 90 dias da primeira importação
(`ConnectPluggyItem.ts:102`) perde transações e ninguém fica sabendo. Também não é enviado
`pageSize`, então vale o padrão da Pluggy (confirme o valor na doc).

## Onde

- `backend/src/modules/openfinance/infra/PluggyClient.ts:205-275`, em especial `:219` e `:221`.

## O que fazer

1. Confira na documentação da Pluggy o endpoint de transações em uso (`/v2/transactions`): o
   `pageSize` máximo e o formato do cursor `next`. Envie o `pageSize` máximo permitido.
2. Troque o limite fixo por um teto de segurança configurável e alto (ex.: 200 páginas) e, se ele for
   atingido, **lance erro tipado** (`ExternalServiceError`, já existe em `backend/src/shared/errors.ts:75`) em vez de devolver dados parciais.
   Assim o caso de uso marca a conexão com erro em vez de importar pela metade.
3. Em `connectPluggyItem`, ao capturar esse erro, grave `status: 'erro'` e `lastError` (mensagem
   genérica, sem dados) na `BankConnection`. Os campos já existem no schema
   (`backend/prisma/schema.prisma:614,617`) e hoje nunca são preenchidos.
4. Não logue descrições nem valores de transação.

## Teste que deve falhar antes

Unitário no padrão do teste existente `PluggyClient fetches v2 transactions with cursor pagination...`
(`backend/src/modules/openfinance/__tests__/openfinance.test.ts:129`), com `fetch` falso:

- 12 páginas encadeadas por `next` → `fetchTransactions` devolve as transações das **12** (hoje devolve 10).
- Cursor infinito (sempre devolve `next`) → lança erro ao atingir o teto, não devolve lista parcial.
- A primeira requisição inclui `pageSize=<máximo>` na query.

## Critério de pronto

- [ ] Testes falharam antes e passam depois.
- [ ] Conexão vai para `status: 'erro'` com `lastError` quando a importação não completa.
- [ ] Gate 0 verde; tabela do `README.md` desta pasta atualizada.
