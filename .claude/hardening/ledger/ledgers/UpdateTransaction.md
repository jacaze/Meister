# Ledger — src/modules/ledger/application/use-cases/UpdateTransaction.ts (160 linhas)

> Mudou em `dbb0c7b` (linhas 62-72 inseridas). Restante idêntico (deslocado +11). **Sem chamadores** — achados latentes.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-38 | input `unknown`; `assertCanWrite`; find escopado com splits e categoria; 404 | §9 ok | ok |
| 39-75 | snapshot `before`; descrição string não vazia (**sem teto de 255**); `amount` > 0 **e agora igual à soma dos splits existentes** | §6 UT1 parcial: splits protegidos; mas `amount` numa perna de transferência continua desalinhando o par | UT1 🟠 · UT3 🟡 |
| 76-114 | `type` só receita/despesa; categoria (string → valida workspace e tipo; não-string → **null**); `paymentMethod` com cast; data estrita; `Boolean(viaPersonalAccount)` | §6 trocar `type` sem `categoryId` mantém categoria do tipo antigo; §2 `categoryId: 123` limpa em silêncio; `Boolean("false")` = true | UT1 🟠 · UT2 🟡 |
| 115-154 | `update` por `where: { id }`, audit separado, evento `transaction.updated` | §7 update e audit não atômicos; input vazio gera audit/evento | UT4 🟡 |
| 155-160 | `return updated` | ok | ok |

## Achados
### UT1 🟠 (parcial) Update ainda permite tipo×categoria incoerente e edição isolada de perna de transferência — :76-90
### UT2 🟡 Coerções silenciosas (`categoryId` não-string, `Boolean("false")`, `paymentMethod`) — :85,103,116
### UT3 🟡 Descrição sem teto no update — :49-55
### UT4 🟡 Update + audit não atômicos; no-op gera audit — :119-143
