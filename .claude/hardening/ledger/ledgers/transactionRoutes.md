# Ledger — src/routes/transactionRoutes.ts (15 linhas)

> Mudou em `dbb0c7b` (rota `GET /transactions/:id`). Lido por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-15 | auth; GET lista, **GET por id (novo)**, POST, PUT, DELETE → `transactionController` (serviço legado) | §11 o CRUD continua **fora do ledger** (regra dura nº 1); a nova rota usa `transactionService.getById` (escopado, ok) e não o `getTransaction` do ledger; sem schema | RX1 🟠 |

## Achados
### RX1 🟠 CRUD de lançamentos continua no serviço legado — :8-12
- Correções do ledger precisam ser duplicadas aqui; já divergem (restauração, audit, eventos — ver transactionService).
