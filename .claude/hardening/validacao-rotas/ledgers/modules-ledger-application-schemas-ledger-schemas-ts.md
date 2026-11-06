# Ledger — backend/src/modules/ledger/application/schemas/ledger-schemas.ts (75 linhas)

Leia o arquivo inteiro com números de linha. Preencha cada bloco: o que as linhas fazem,
quais itens do checklist foram verificados, e o achado (`ok` ou `#id` com severidade).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-40 | createSplitSchema (L3-7). createTransactionSchema interno (L9-25): entityId nullish→undefined (L11), type inclui transferencia/aporte/retirada, description 1..1000, ids e paymentMethod anuláveis. updateTransactionSchema interno (L27-39). | chamadores internos (ConfirmProposal, ApproveImportedTransaction, receiptRoutes) repassam campos de rascunho que podem ser nulos; type espelha CreateTransactionInput (CreateTransaction.ts:22) e o caso de uso grava valores fora de receita/despesa como despesa (L196, L244); descrição ≤1000 cobre memo longo de extrato (coluna sem limite); paymentMethod = enum Prisma PaymentMethod. | ok — entityId nulo agora aceito (teste unitário em validation-schemas.test.ts) |
| 41-75 | Schemas HTTP de lançamento (L41-61) usados por transactionService: categoryId obrigatório na criação, paymentMethod aceita "" e null, viaPersonalAccount opcional. Transferência (L63-69) com contas uuid e pró-labore (L71-75). | corpos do QuickTransactionModal.tsx:170 e EditTransactionSheet.tsx:121 cobertos pelos casos 3 e 4 da suíte de contrato; amount aceita string|number e o formato é validado depois por Money.fromDecimalString (400, nunca 500 — probe de fuzz); fromAccountId/toAccountId uuid porque vêm de contas reais. | ok |

## Achados

<!-- ### #1 🔴|🟠|🟡 título — arquivo:linha / trecho / por que / teste que prova / correção -->


Revisado em 2026-11-06 após os commits bdad04b, 601fafd e 5770f0c (relido arquivo inteiro com números de linha).
