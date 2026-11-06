# Ledger — src/shared/money.ts (238 linhas)

> Arquivo **idêntico** ao revisado em `0b21ac9`. Leitura reaproveitada; achados reavaliados.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-34 | `MAX_MONEY_CENTS` = 999.999.999.999; regex estrita e de canal; construtor rejeita `< 0` e `> MAX`; `zero()`; `fromCents` exige safe integer | §4 regex de 10 dígitos + 2 casas = exatamente o teto; a classe não representa valor com sinal. O chamador que quebrava (ListTransactions) foi corrigido; `CashForecastDetector.ts:47` (insights) ainda usa `fromCents` com valor que pode ser negativo | M1 🟠 |
| 35-74 | `fromDecimalString` (tipo, regex, troca vírgula, padEnd, BigInt, `requirePositive`); `fromInput` string (vazio, negativo com mensagem própria) | §1 validação antes do uso; `" 10 "`, `"1."`, `".5"` rejeitados; sem float no parse de string | ok |
| 75-114 | `fromInput` number (finito, `<= 0`, notação exponencial rejeitada, máx. 2 casas); `sum` | §3 `0.1+0.2` rejeitado (seguro); §4 `sum` acima do teto lança 400 numa agregação (remoto) | M4 🟡 |
| 115-152 | `formatCents` com sinal, `centsToNumber`/`toNumber` (float), comparações | §3 float usado para gravar no banco (`transactionService`, `CreateTransaction`) e responder (`dashboardService`, `transactionService.list`) — contra a regra do CLAUDE.md | M3 🟡 |
| 153-184 | `add`, `sub` (lança se negativo), `signedDiff`, `mulRatio` half-up | §4 half-up correto; §3 `BigInt(1.5)`/`BigInt(NaN)` → `RangeError` (500); chamadores atuais passam inteiros | M2 🟡 |
| 185-223 | `allocate` (maior resto): valida pesos e soma > 0, cota e resto | §4/§3 ok | ok |
| 224-238 | distribui sobras pelos maiores restos, desempate por índice | §4 `leftover` < nº de pesos com resto > 0 → índice sempre válido; peso 0 nunca recebe centavo; soma == total | ok |

## Achados
### M1 🟠 `Money` sem sinal convida ao erro em saldos/resultados — money.ts:12-14
- Corrigido no ledger (ListTransactions agora formata o sinal à parte). Resta `insights/domain/detectors/CashForecastDetector.ts:47-49` (fora do escopo). Sugestão: helper `Money.formatSigned(bigint)` documentado e usado em todo resultado.
### M2 🟡 `mulRatio` com número não inteiro → RangeError (500) — :172-173
### M3 🟡 `toNumber`/`centsToNumber` (float) usados para persistir e responder — :123-133
### M4 🟡 `sum` acima do teto lança 400 em agregação — :107-113
