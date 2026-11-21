# 07 — Valores da Pluggy convertidos com `Money`, sem float

**Prioridade:** 🟡
**Donos:** QA (teste) → Backend
**Branch sugerida:** `fix/pluggy-valores-money`

## Problema

A regra do `CLAUDE.md` proíbe `number` (float) para dinheiro. A importação da Pluggy faz:

- `PluggyClient.ts` (dentro de `fetchTransactions`): `parseFloat(String(tx.amount))` e, se der `NaN`,
  vira **0**. Uma transação com valor ilegível entra como R$ 0,00 em vez de ser rejeitada.
- `ConnectPluggyItem.ts:167`: `Math.abs(tx.amount).toFixed(2)`. Arredondamento binário pode
  errar o centavo (ex.: `1.005.toFixed(2) === '1.00'`).
- `ConnectPluggyItem.ts:168`: `new Date(tx.date.slice(0, 10))` cria a data em UTC. Ok para data
  pura, mas o resto do projeto usa `LocalDate`; padronize.
- A direção (`in`/`out`) é decidida por `tx.type === 'CREDIT' || tx.amount > 0`. Se `type` e sinal
  discordarem, o resultado depende da ordem do `if`.

## O que fazer

1. Faça o `PluggyClient` devolver o valor como **string decimal** (ou centavos `bigint`), sem passar por
   float. Se a Pluggy mandar `number`, converta com segurança usando `Money.fromDecimalString` (`backend/src/shared/money.ts:35`)
   e datas com `LocalDate` (`backend/src/shared/clock.ts:100`).
2. Valor ausente ou inválido → a transação é **descartada e contada** (`invalidSkippedCount` no resultado),
   não importada como zero.
3. `ConnectPluggyItem`: use `Money` para o valor absoluto e `LocalDate` para a data.
4. Direção: use `type` quando existir; sinal só como fallback. Documente no código em uma linha.
5. Atualize o tipo `PluggyTransactionInfo.amount` no port (`BankingAggregator.ts:32`).

## Teste que deve falhar antes

- Unitário: transação Pluggy com `amount: 1.005` → importada como `'1.01'` (ou a regra de
  arredondamento que o `Money` adota; deixe explícito no teste).
- Unitário: `amount: 'abc'` → não importada, `invalidSkippedCount = 1` (hoje entra como `'0.00'`).
- Unitário: `type: 'DEBIT'` com `amount: 50` positivo → `direction: 'out'`.

## Critério de pronto

- [ ] Nenhum `parseFloat`/`toFixed` em código de dinheiro no módulo `openfinance` (`grep` no PR).
- [ ] Testes falharam antes e passam depois; mutação do módulo ≥ 80% (Gate A).
- [ ] Tabela do `README.md` desta pasta atualizada.
