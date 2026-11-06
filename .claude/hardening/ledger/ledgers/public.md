# Ledger — src/modules/ledger/public.ts (6 linhas)

> Arquivo **idêntico** ao revisado em `0b21ac9`.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-6 | `export *` dos 6 use cases | §11 `transferRoutes` agora importa só do `public.ts` (corrigido); `updateTransaction`, `deleteTransaction`, `getTransaction` continuam **sem chamador** — o CRUD real é `services/transactionService.ts` | PB1 🟡 |

## Achados
### PB1 🟡 Duas implementações paralelas do CRUD de lançamentos
- Toda correção feita nos use cases do ledger (ex.: splits no `UpdateTransaction`) precisa ser duplicada no legado; hoje os dois já divergem (restore, audit, eventos).
