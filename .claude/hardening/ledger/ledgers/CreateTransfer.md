# Ledger — src/modules/ledger/application/use-cases/CreateTransfer.ts (166 linhas)

> Arquivo **idêntico** ao revisado em `0b21ac9`. Leitura reaproveitada; achados reavaliados contra o código atual (TR1 foi atacado só num leitor, `GetMeiLimit`).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-34 | `CreateTransferInput`; `createTransfer`: `assertCanWrite` (agora allowlist), origem ≠ destino, valor > 0 | §1 ids ausentes → "devem ser diferentes" (mensagem enganosa, 400 funcional) | ok |
| 35-74 | contas por id+workspace (404); data estrita; `transferGroupId`; descrição; `$transaction`; perna de saída **`type: 'despesa'`** | §9 anti-IDOR ok; §1 descrição sem limite e não-string → 500; §3 perna é despesa comum, marcada só por `transferGroupId` | TR1 🔴 · TR3 🟡 |
| 75-112 | perna de entrada **`type: 'receita'`**; `registerOwnerWithdrawal` (exige PJ, valor > 0) | §7 `$transaction` atômico (ok); §5 sem `TransactionAudit` e sem evento; §7 sem idempotência | TR1 🔴 · TR2 🟠 · TR4 🟡 |
| 113-147 | data via `fromIsoDate` (400); categoria pró-labore; perna PJ `despesa` | §4 pró-labore como despesa da PJ distorce o lucro | TR5 🟡 |
| 148-166 | perna PF `receita` + retorno | TR2 | TR2 🟠 |

## Achados

### TR1 🔴 Transferência é contabilizada como receita e despesa — CreateTransfer.ts:65,80 (+ leitores)
- **Estado atual:** `GetMeiLimit.ts:79` passou a filtrar `transferGroupId: null` → o **limite MEI** está correto. Nenhum outro leitor filtra: `grep transferGroupId` fora do ledger → só `GetMeiLimit` e o `remove` legado.
- **Prova (probe atual, P-TR1):** após transferir R$ 10.000 PF→PJ: limite MEI `0.00 → 0.00` ✅; **dashboard** entradas `0 → 10000`, despesas `250 → 10250`; **resumo do ledger** idem. Ainda afetados (por leitura): `GetJarsStatus` (base dos potes), `PrismaFinancialSnapshotReader` (insights), `AskFinances`, `transactionService.list`.
- **Correção (causa):** o ledger exportar um filtro canônico de "lançamento de resultado" (`deletedAt: null, status: 'confirmado', transferGroupId: null`) e todos os leitores usarem; ou tipar a perna como transferência.

### TR2 🟠 Transferência e pró-labore sem auditoria nem evento — :59-91, :132-165
### TR3 🟡 Descrição sem limite e sem checagem de tipo — :57, :121
### TR4 🟡 Sem idempotência (duplo envio duplica) — :20-92, :100-166
### TR5 🟡 Pró-labore lançado como despesa da PJ — :138
