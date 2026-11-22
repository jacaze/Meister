# GET /api/dashboard

Filtros: `entityId` (opcional; entidade de outro workspace responde 404), `startDate`, `endDate`, `categoryId`, `months`.

## Regra de saldo (`saldoAtual`)

`saldoAtual = Σ receitas − Σ despesas` dos lançamentos válidos (`validTransactionsWhere()`: não apagados e confirmados),
da entidade informada ou do workspace inteiro quando não há `entityId`.

- Entram no saldo as pernas de transferência e pró-labore e as entradas "não é renda" (`own_account`, `refund`): todas movem o caixa.
  O pró-labore diminui o caixa da PJ e aumenta o da PF; no workspace as duas pernas se anulam.
- `financial_accounts.opening_balance` NÃO entra: nenhuma API ou tela lê ou grava o campo (só o seed demo), contas importadas
  ficam em 0 e o saldo sempre foi calculado por movimentações. Se o produto passar a coletar saldo inicial, somar `opening_balance`
  das contas da entidade/workspace aqui.

## Resultado e série (DRE)

`periodo.*`, `porCategoria` e `evolucaoMensal` seguem excluindo `transferGroupId != null` (transferências, pró-labore e "não é renda"),
e respeitam `entityId`. `ultimasTransacoes` lista as 5 últimas movimentações da entidade (ou do workspace), inclusive transferências.
