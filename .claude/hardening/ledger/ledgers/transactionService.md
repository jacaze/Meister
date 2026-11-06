# Ledger — src/services/transactionService.ts (475 linhas)

> Caminho **real** de `GET/POST/PUT/DELETE /api/transactions` (tela de Lançamentos e "+" rápido). Mudou em `dbb0c7b` (papel, entidade, `sourceRef` com restauração, splits no update, exclusão em par). Lido de novo por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-40 | imports (agora `assertCanWrite`); listas de tipo e forma de pagamento; `parseType`, `parsePaymentMethod` | §1 listas de permissão (ok) | ok |
| 41-72 | `parseDescription` (1..255), `parseAmountToMoney` (> 0), `findOwnCategory` (workspace), `assertCategoryType` | §1/§9 ok | ok |
| 73-112 | `TransactionQuery`; `buildWhere`: workspace + `deletedAt: null`; `entityId`/`categoryId` crus; tipo/pagamento validados; busca; datas por `fromInput` (C1 corrigido) | §1 `?categoryId=a&categoryId=b` (array) → erro Prisma → 500 | TS6 🟡 |
| 113-152 | intervalo de datas; `create`: auth, **`assertCanWrite`** (TS2 corrigido), descrição/valor/tipo/pagamento/data, categoria do workspace e do tipo | §9 papel checado; §1 data `DD/MM/AAAA` agora correta | ok |
| 153-187 | entidade alvo + **validação por id+workspace+active → 404** (TS1 corrigido); **`sourceRef` vindo do cliente** (string livre, só `trim`); `findUnique(workspaceId, sourceRef)` | §9 P-TS1: 404; §1 o `sourceRef` do cliente compartilha o espaço `(workspaceId, sourceRef)` com `nfe:`, `proposal:`, `pluggy:`… usados pelos fluxos internos | N4 🟠 |
| 188-227 | vivo → devolve existente (mesmo com payload diferente); **apagado → `update` restaurando** só descrição/valor/tipo/categoria/pagamento/data/entidade; senão `create` com `sourceRef` | §6 restauração não apaga splits antigos, não reseta `status`/`origin`/`userId`, não grava audit (P-N3: total 7, splits 100, nenhum audit de restore); §1 payload divergente ignorado | N3 🔴 · N4 🟠 |
| 228-267 | `catch` P2002 → relê e devolve; `list`: auth, `buildWhere`, paginação | §7 corrida tratada; `list` sem checagem de papel (leitura — ok) | ok |
| 268-302 | página + `count` + **todas as linhas** para o resumo; soma em Money | §8 O(n) em memória; soma inclui pernas de transferência (TR1/P-TR1) e pendentes | LT3 🟠 |
| 303-341 | resposta com paginação duplicada (pt/en) e resumo em **float**; `getById` escopado (agora com rota) | §3 contrato duplo e float | TS8 🟡 |
| 342-380 | `update`: auth, `assertCanWrite`, find escopado **com splits**, montagem de `data`, tipo-alvo | §9 ok | ok |
| 381-418 | descrição; **`amount` validado contra a soma dos splits** (UT1/legado corrigido — P-UT1: 400); pagamento; data `fromInput`; `Boolean(viaPersonalAccount)` | §6 `amount` numa **perna de transferência** ainda desalinha o par (P-TS4: pernas 50 e 1); §3 `Boolean("false")` = true | TS4 🟠 · TS7 🟡 |
| 419-455 | categoria nova validada no tipo-alvo; troca de tipo sem categoria → `category.findUnique({ id: transaction.categoryId ?? undefined })`; `update` por id | §5 lançamento sem categoria (perna de pró-labore, lançamento dividido) + troca de tipo → **500** (P-TS5); §6 trocar categoria num lançamento dividido gera `categoryId` + splits | TS5 🟠 · TS9 🟡 |
| 456-475 | `remove`: soft delete; **transferência → `updateMany` do par** (corrigido — P-orfã: 0 pernas vivas) | §5 sem audit nem evento em create/update/remove; §6 `updateMany` sem `deletedAt: null` | TS3 🟠 · DL1 🟡 |

## Achados

### N3 🔴 Restauração pelo legado deixa splits antigos e não audita — transactionService.ts:192-208
- **Prova (P-N3):** NF-e com splits 60/40 criada pelo ledger → apagada → `POST /api/transactions` (o "+" rápido manda `sourceRef: nfe:<chave>`, `QuickTransactionModal.tsx:164`) com R$ 7 → `{"status":201,"total":"7","somaSplits":100,"audits":2}` — 2 audits = create + delete; **nenhum de restore**.
- **Correção:** delegar ao `ledger.createTransaction` (que já tem o ramo de restauração, após corrigir N1/N2) ou replicar: `$transaction` + `deleteMany` de splits + audit `restore` + reset de `status/origin`.

### N4 🟠 `sourceRef` do cliente sequestra a idempotência dos fluxos internos — :170-191
- **Prova (P-N4):** `POST /api/transactions` com `sourceRef: "pluggy:ext-…"` e R$ 1 → depois a aprovação do Open Finance (`createTransaction` com o mesmo `sourceRef`, R$ 5.000) **devolve o lançamento manual de R$ 1** (`origin: manual`) e o item bancário é marcado como importado. O mesmo vale para `proposal:` (Telegram) e para restaurar/sobrescrever lançamentos apagados de qualquer origem.
- **Correção:** prefixar o `sourceRef` do cliente (`manual:<valor>`) ou aceitar só `nfe:<44 dígitos>` validado; nunca aceitar prefixos internos vindos do HTTP.

### TS4 🟠 Perna de transferência editável isoladamente — :389-403
- **Prova (P-TS4):** `PUT` com `amount: 1` na perna PF do pró-labore → 200; pernas ficam `50` e `1`.
- **Correção:** recusar `amount/type/entityId` em lançamento com `transferGroupId` (ou editar o par).

### TS5 🟠 Troca de tipo em lançamento sem categoria → 500 — :426-429
- **Prova (P-TS5):** 500 `INTERNAL_ERROR`. Correção: `if (!transaction.categoryId) throw new ValidationError(...)` antes do `findUnique`.

### TS3 🟠 Escritas sem auditoria e sem evento — :192-251, :437-444, :460-474
### LT3 🟠 Resumo carrega todas as linhas e soma transferências — :279-299
### TS1 ✅ IDOR de entidade (P-TS1: 404) · TS2 ✅ papel checado · C1 ✅ datas BR · DELETE em par ✅ · UT1 (splits) ✅
### TS6 🟡 Filtros array → 500 — :93-94
### TS7 🟡 `Boolean("false")` = true; valores gravados via float — :198,203,220,224,402,416
### TS8 🟡 Paginação duplicada e resumo em float — :303-320
### TS9 🟡 Categoria única num lançamento dividido — :419-425
### DL1 🟡 `updateMany` sem `deletedAt: null` — :462-468
