# Ledger — src/modules/ledger/application/use-cases/GetTransaction.ts (25 linhas)

> Arquivo **idêntico** ao revisado em `0b21ac9`. Sem chamadores (a nova rota `GET /transactions/:id` usa o legado `getById`).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-25 | find por id+workspace+`deletedAt: null` com categoria e splits; 404 | §9 leitura escopada; viewer pode ler (correto); `id` texto livre sem erro de tipo | ok |

## Achados
Nenhum.
