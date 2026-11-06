# Ledger — src/modules/ledger/application/use-cases/ListTransactions.ts (141 linhas)

> Mudou em `dbb0c7b` (linhas 125-127, 138). As linhas 1-124 são idênticas à leitura de `0b21ac9` (`git diff -U0` confirma: só esses dois hunks).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-37 | tipos do filtro; `where` workspace + `deletedAt: null`; filtro de entidade | §9 escopado; apagados fora | ok |
| 38-77 | filtros type/categoryId/paymentMethod/status/origin sem validação runtime; busca `contains` insensitive; datas por `fromIsoDate` | §1 enum inválido/array → erro Prisma 500 (só o Telegram chama, com filtros fixos → não alcançável por HTTP); `search` não-string → TypeError | LT4 🟡 |
| 78-114 | paginação (≤ 100); página + `count` + **todas as linhas** do filtro para somar | §8 O(n) em memória por chamada; o Telegram chama sem filtro | LT3 🟠 |
| 115-141 | soma receita/despesa; **resultado negativo agora formatado com sinal à parte** (`-${Money.fromCents(-x)}`); resposta | §4 LT1 corrigido (P-LT1: `"-250.00"`); §3 resumo ainda soma pernas de transferência (P-TR1: entradas 0→10000, despesas 250→10250) e `pendente_revisao` | LT2 🟠 |

## Achados
### LT1 ✅ (corrigido) Listagem quebrava com despesas > receitas
### LT2 🟠 Resumo soma transferências (e pendentes) — :115-122 (efeito de TR1, provado P-TR1)
### LT3 🟠 Soma carrega todas as linhas em memória — :106-109 (usar `groupBy` com `_sum`)
### LT4 🟡 Filtros sem validação runtime → 500 — :38-66
