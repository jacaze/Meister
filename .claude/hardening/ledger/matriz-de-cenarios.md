# Matriz de cenários — ledger + `/api/transactions` (fix/ledger-hardening @ 7660a62)

Status: **BUG** = reproduzido em `probes/` · **ok (provado)** = correto, reproduzido · **ok (teste)** = coberto por teste do repositório · **ok (lido)** = correto pela leitura, sem teste · **lacuna** = sem prova nem teste.
Testes do repositório: `src/modules/ledger/__tests__/ledger.test.ts` (unit) e `tests/ledger.integration.test.ts` (integração).

| # | Função | Técnica | Cenário | Esperado | Prova / teste | Status |
|---|---|---|---|---|---|---|
| 1 | createTransaction | partição (valor) | `0`, `"0.00"`, `-5`, `"10,50"`, `1e21`, `NaN` | 400 | — | ok (lido) / lacuna |
| 2 | createTransaction | limite (valor) | `0.01`; `9999999999.99`; `10000000000.00` | ok; ok; 400 | kernel.test parcial | lacuna |
| 3 | createTransaction | partição (descrição) | vazia; 255; 256; número | 400; ok; 400; 400 | — | **número → 500** (CT7) |
| 4 | createTransaction | partição (data) | `2028-02-29`; `2026-02-29`; `1970-01-01`; `2199-12-31` | ok; 400; ?; ? | — | lacuna (sem faixa — CT8) |
| 5 | createTransaction | id de outro dono | `entityId` de outro workspace | 404 | — | ok (lido) |
| 6 | createTransaction | decisão (categoria) | status {confirmado, pendente} × categoria {própria, alheia, ausente, tipo errado} | alheia sempre recusada | P-CT1; ledger.test | ok (provado) — tipo errado em pendente aceito (CT1b) |
| 7 | createTransaction | decisão (splits) | 1 split; soma ≠ total; categoria alheia; tipo errado; 1000 splits | 400 ×4; limite | — | lacuna (1000 → N+1, CT9) |
| 8 | createTransaction | repetição | mesmo `sourceRef` vivo 2× | mesmo registro | — | ok (lido) |
| 9 | createTransaction | concorrência | 8× simultâneos, `sourceRef` vivo | 8 × mesmo registro | P-CT3; ledger.integration | ok (provado) |
| 10 | createTransaction | estado (restauração) | `sourceRef` apagado, nova entrada **sem** splits | splits antigos removidos | P-N1; ledger.integration | ok (provado) |
| 11 | createTransaction | concorrência + estado | 6× simultâneos restaurando com splits | soma dos splits = total, 1 audit | P-N2; ledger.integration | ok (provado) |
| 12 | createTransaction | repetição | mesmo `sourceRef`, payload diferente | 409 | — | lacuna (CT4) |
| 13 | createTransaction | default | receita sem `entityId` com PJ | regra explícita | — | lacuna (vai p/ PJ — CT5) |
| 14 | createTransaction | partição (tipo) | `aporte`/`retirada`/`transferencia` | tratado ou recusado | — | lacuna (vira despesa — CT6) |
| 15 | assertCanWrite | autorização | owner / editor / viewer / desconhecido | ok/ok/403/403 | P-S1; ledger.test | ok (provado) |
| 16 | createTransfer | partição | origem = destino; conta alheia; valor 0 | 400/404/400 | — | ok (lido) / lacuna |
| 17 | createTransfer | efeito | transferência PF→PJ: limite MEI | inalterado | P-TR1a; ledger.integration | ok (provado) |
| 18 | createTransfer | efeito | transferência: dashboard e resumo | inalterados | P-TR1b, P-TR1c; ledger.integration | ok (provado) |
| 19 | createTransfer | efeito | audit e evento | 2 audits, 2 eventos | — | lacuna (nenhum — TR2) |
| 20 | createTransfer | repetição | duplo envio | 1 transferência | — | lacuna (TR4) |
| 21 | createTransfer | falha | 2ª perna falha | nada gravado | `$transaction` | ok (lido) |
| 22 | listTransactions | limite | despesas > receitas | resultado negativo, sem erro | P-LT1; ledger.test | ok (provado) |
| 23 | listTransactions | volume | 100 mil lançamentos | soma no banco | — | lacuna (LT3) |
| 24 | LocalDate.fromInput | partição | `04/11/2026`, `2026`, `1`, `2026-11-4`, `31/02/2026` | 2026-11-04; ERRO ×4 | P-C1; ledger.test | ok (provado) |
| 25 | LocalDate.fromInput | partição (fuso) | `2026-11-04T01:00:00` sem offset em TZ=UTC e TZ=SP | mesmo dia ou ERRO | P-C2 | **BUG** C2 (03/11 vs 04/11) |
| 26 | POST /api/transactions | id de outro dono | `entityId` alheio | 404 | P-TS1; ledger.integration | ok (provado) |
| 27 | POST /api/transactions | estado (restauração) | `sourceRef: nfe:` de lançamento dividido apagado | splits removidos + audit | P-N3; ledger.integration | ok (provado) |
| 28 | POST /api/transactions | namespace | cliente envia `pluggy:<id>` antes da importação | importação não afetada | P-N4; ledger.integration | ok (provado) |
| 29 | PUT /api/transactions | estado | `amount` ≠ soma dos splits | 400 | P-UT1; ledger.integration | ok (provado) |
| 30 | PUT /api/transactions | estado | `amount` numa perna de transferência | 400 ou par alinhado | P-TS4; ledger.integration | ok (provado) |
| 31 | PUT /api/transactions | estado | troca de tipo sem categoria atual | 400 | P-TS5; ledger.integration | ok (provado) |
| 32 | DELETE /api/transactions | estado | apagar uma perna | par apagado | P-orfa; ledger.integration | ok (provado) |
| 33 | todas as escritas legadas | efeito | audit + evento | gravados | — | lacuna (TS3) |
| 34 | GET /api/transactions | partição (query) | `?categoryId=a&categoryId=b` | 400 | — | lacuna (500 — TS6) |
| 35 | escritas legadas | autorização | viewer | 403 | — (assertCanWrite no serviço) | ok (lido) |
| 36 | POST /api/transfers | entrada | body ausente; descrição de 10 MB | 400 | — | lacuna (RT1/TR3) |
| 37 | updateTransaction (ledger) | — | sem chamador | — | — | latente (UT1 parcial) |
