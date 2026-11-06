# Ledger — src/modules/ledger/application/use-cases/CreateTransaction.ts (296 linhas)

> Mudou em `dbb0c7b` (idempotência com restauração, validação de categoria, captura de P2002). Lido de novo por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-35 | imports; `CreateSplitInput`; `CreateTransactionInput` (type inclui `transferencia/aporte/retirada`, `financialAccountId`, `status`, `sourceRef`) | §11 contrato promete `financialAccountId` e 3 tipos que o corpo não honra | CT6 🟡 |
| 36-71 | `assertCanWrite` (allowlist); idempotência: `findUnique(workspaceId, sourceRef)`; vivo → devolve; **apagado → guarda `existingDeletedId` para restaurar**; valor via Money estrito > 0 | §6 check-then-act: duas chamadas simultâneas sobre o mesmo `sourceRef` apagado seguem ambas para o ramo de restauração (ver 151-230); §1 `sourceRef` vivo com payload diferente devolve o antigo em silêncio | N2 🔴 · CT4 🟡 |
| 72-110 | descrição (`input.description ? .trim()`, 1..255); data `fromIsoDate` estrito; entidade `entityId ?? (receita && pj ? pj : pf)` validada por id+workspace+active (404) | §3 descrição não-string → TypeError 500 (alcançável por `/receipts/confirm`); §4 sem faixa de plausibilidade (1970..2200); §2 receita sem entidade vai para a PJ (faturamento MEI); §9 entidade escopada (ok) | CT7 🟡 · CT8 🟡 · CT5 🟠 |
| 111-150 | splits: ≥ 2, cada um > 0, categoria por id+workspace (N+1), tipo compatível se receita/despesa, soma == total | §7 sem limite de quantidade; §9 split escopado (ok); soma exata em centavos (ok) | CT9 🟡 |
| 151-190 | sem splits: **categoria sempre validada no workspace** (CT1 corrigido); tipo só checado se `confirmado`; obrigatória se confirmado+receita/despesa; `txDateDb`; **restauração**: `transactionSplit.deleteMany` **só se a nova entrada tiver splits**, depois `transaction.update` (fora de `$transaction`) com type mapeado (`aporte`→`despesa`), `amount: Number(...)`, `deletedAt: null` | §9 CT1 provado corrigido (P-CT1); §6 restauração sem splits mantém os splits antigos ao lado de `categoryId` (P-N1); §7 `deleteMany` e `update` não atômicos → restaurações concorrentes acumulam splits (P-N2); §4 `pendente_revisao` aceita categoria de tipo errado | N1 🔴 · N2 🔴 · CT1b 🟡 · CT6 🟡 |
| 191-230 | fim do `update` de restauração: cria novos splits, audit `restore` aninhado; ramo `create`: início do `data` | §5 audit de restore atômico com o update (ok), mas não com o `deleteMany`; §6 restauração não revalida/limpa `financialAccountId`, `createdAt` antigo preservado (aceitável) | N2 🔴 |
| 231-270 | `create` com `sourceRef`, splits aninhados, audit `create` aninhado (atômico) | §3 `amount` via `Number(toDecimalString())` (M3); `status` String livre no banco; `paymentMethod`/`origin` inválidos → erro Prisma 500 | CT10 🟡 |
| 271-296 | `catch` P2002 com `sourceRef` → relê e devolve o vencedor (**CT3 corrigido**); senão relança; publica `transaction.created` (também após restauração); retorna | §7 P-CT3: 8/8 ok; §5 bus sem `onError` → falha de handler some; restauração publica `created` (semântica) ; `new Date()` em vez de Clock | CT11 🟡 |

## Achados

### N1 🔴 Restaurar lançamento dividido sem splits deixa os splits antigos — CreateTransaction.ts:162-166, 180
- **Trecho:** `if (input.splits && input.splits.length > 0) { await prisma.transactionSplit.deleteMany(...) }` e depois `categoryId: (input.splits?.length) ? null : categoryId`.
- **Prova (P-N1):** NF-e de R$ 100 com splits 60/40 → apagada → registrada de novo com R$ 30 e categoria única → `{"total":"30","categoryId":true,"somaSplits":100}`. Lançamento fica com categoria **e** splits, e a soma diverge do total (invariante que o próprio create exige na linha 137).
- **Correção:** na restauração, sempre `deleteMany` dos splits antigos.

### N2 🔴 Restaurações concorrentes multiplicam os splits — CreateTransaction.ts:161-211
- **Trecho:** `deleteMany` (linha 163) e `update` com `splits.create` (linha 168) em chamadas separadas, sem `$transaction` e sem guarda de estado.
- **Prova (P-N2):** 6 chamadas simultâneas com o mesmo `sourceRef` apagado e splits 60/40 → `{"ok":6,"somaSplits":600,"auditsRestore":6}` num lançamento de R$ 100.
- **Correção:** restauração condicional e atômica: `prisma.$transaction` com `updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null, ... } })`; só quem obtiver `count === 1` recria os splits; os demais releem e devolvem.

### CT1 ✅ (corrigido) Categoria de outro workspace com `pendente_revisao` — P-CT1: "Categoria não encontrada"
### CT2 ✅ (mudou) Idempotência devolvia lançamento apagado — agora restaura (mas ver N1/N2)
### CT3 ✅ (corrigido) Corrida no `sourceRef` vivo virava 500 — P-CT3: 8/8 ok
### CT5 🟠 Receita sem entidade cai na PJ (faturamento MEI) — :94-98 (decisão de produto pendente)
### CT1b 🟡 `pendente_revisao` aceita categoria de tipo incompatível — :150
### CT4 🟡 `sourceRef` vivo com payload diferente devolve o antigo — :57-60
### CT6 🟡 `financialAccountId` ignorado; `aporte/retirada/transferencia` viram despesa — :21,28,173,219
### CT7 🟡 Descrição não-string → 500 — :73
### CT8 🟡 Data sem faixa de plausibilidade — :82-91
### CT9 🟡 Splits sem limite e N+1 — :117-135
### CT10 🟡 `status`/`paymentMethod`/`origin` sem validação runtime; `amount` via float — :108,175-179,221-225
### CT11 🟡 Evento: falha engolida, restauração publica `created`, `new Date()` — :281-293
