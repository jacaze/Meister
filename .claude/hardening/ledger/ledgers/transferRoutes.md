# Ledger — src/routes/transferRoutes.ts (24 linhas)

> Mudou em `dbb0c7b` (imports agora só do `public.ts`). Lido por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-24 | auth em `preHandler`; `POST /transfers` e `POST /owner-withdrawals` repassam `request.body` cru ao ledger; 201 | §11 fronteira corrigida (PB1 parcial); §1 **sem schema**: body ausente → `input` undefined → TypeError 500; descrição até o `bodyLimit` de 10 MB; §7 sem idempotência | RT1 🟡 |

## Achados
### RT1 🟡 Sem validação de schema nas rotas de transferência — :13-21
