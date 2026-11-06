# Ledger — src/controllers/transactionController.ts (55 linhas)

> Mudou em `dbb0c7b` (guardas `assertCanWrite`). Lido por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-32 | `list` (query com cast), `getById` (agora com rota), `create` com **`if (request.scope) assertCanWrite(...)`** | §9 guarda condicional: sem `scope` a checagem é pulada (padrão fail-open). Não explorável hoje: o middleware sempre define `scope` e o serviço chama `assertCanWrite(resolvedScope)` de novo — checagem duplicada; §3 casts sem validação | CC2 🟡 · CC1 🟡 |
| 33-55 | `update` e `remove` com a mesma guarda condicional; 204 no remove | idem | CC2 🟡 |

## Achados
### CC2 🟡 Guarda de papel condicional e duplicada — :27,37,52
- Remover do controller (o serviço já checa) ou tornar incondicional; `if (scope)` ensina o padrão errado.
### CC1 🟡 Casts `as` sem validação de body/query — :8,28,38
