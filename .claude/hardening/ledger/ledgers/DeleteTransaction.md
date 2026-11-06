# Ledger — src/modules/ledger/application/use-cases/DeleteTransaction.ts (66 linhas)

> Arquivo **idêntico** ao revisado em `0b21ac9`. **Sem chamadores** (o `DELETE /api/transactions` usa o legado). Achados latentes.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-37 | `assertCanWrite`; find por id+workspace+`deletedAt: null` (404); transferência → `updateMany` por `transferGroupId`; senão `update` | §9 escopo ok; §6 `updateMany` sem `deletedAt: null` reescreve instante de perna já apagada; soft delete preserva `sourceRef` (agora o create restaura — ver CT2/N1/N2) | DL1 🟡 |
| 38-66 | audit `delete` só da perna clicada; evento só dela | §7 exclusão e audit não atômicos; §5 2ª perna sem audit/evento; §8 `bankTransaction.importedTransactionId` fica órfão | DL2 🟠 · DL3 🟡 |

## Achados
### DL2 🟠 Exclusão e audit não atômicos; transferência audita uma perna — :26-50
### DL1 🟡 `updateMany` sem `deletedAt: null` — :27-30
### DL3 🟡 Item do Open Finance não volta para a inbox após apagar o lançamento importado (fora do módulo)
