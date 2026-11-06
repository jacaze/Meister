# Ledger — src/shared/clock.ts (332 linhas)

> Mudou em `dbb0c7b` (linhas 6-7 e 203-218). Lido de novo por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-39 | TZ padrão; regex ISO, **BR `DD/MM/AAAA`**, **timestamp ISO** (sem âncora final), `YYYY-MM`; `daysInMonth`; `YearMonth` (1970..2200, 1..12); `fromString` | §4 `Date.UTC(y, m, 0)` com mês 1-based = último dia do mês (bissexto ok); §1 `ISO_TIMESTAMP_REGEX` aceita qualquer sufixo após `HH:MM:SS` (decisão final fica com o `Date`) | ok |
| 40-79 | aliases, `YearMonth.today()` com `SystemClock` próprio, toString, start/endDate, comparações | §11 `today()` estático contorna o `Clock` injetável | C3 🟡 |
| 80-119 | `isAfter`, `addMonths`, start/endOfMonth, construtor de `LocalDate` com dia validado pelo mês | §4 `addMonths` negativo/fracionário tratado (fracionário → ValidationError); 29/02 em ano não bissexto rejeitado | ok |
| 120-159 | `fromParts`; `today()`/`now()` estáticos (C3); `fromIsoDate` estrito; início de `fromInstant` (Intl en-CA no TZ) | §1 `fromIsoDate` estrito (usado pelo ledger); §3 TZ inválido → RangeError (só default é usado) | C3 🟡 |
| 160-194 | fim de `fromInstant`; `fromInput`: LocalDate, Date (coluna `@db.Date` via UTC; senão instante → TZ) | §3 `Number(undefined)` → NaN → construtor rejeita (ok) | ok |
| 195-234 | `fromInput` string: vazio → erro; ISO estrito; **BR `DD/MM/AAAA` → (ano, mês, dia) com validação de calendário**; **timestamp ISO → `new Date` → instante no TZ de SP**; resto → ValidationError; toIsoDate, toUtcDate, toUtcEndOfDay | §1 C1 corrigido: sem fallback genérico (provado P-C1). §3 timestamp **sem offset** (`2026-11-04T23:30:00`) é interpretado no **fuso do processo** antes da conversão para SP → resultado depende do `TZ` do servidor (provado P-C2) | C2 🟡 |
| 235-273 | `addDays`, comparações, `dayOfWeek` (UTC), `isWeekend` | §4 ok | ok |
| 274-311 | interface `Clock`, `SystemClock`, `FakeClock` | ok | ok |
| 312-332 | `FakeClock.setNow`, `advanceMs`, `advanceMinutes` | ok | ok |

## Achados

### C1 ✅ (corrigido) Datas arbitrárias interpretadas como instante no fuso do servidor
- Antes: `"04/11/2026"` → abril; `"2026"` → 31/12/2025. Agora: `04/11/2026 → 2026-11-04`; `2026`, `1`, `2026-11-4`, `31/02/2026` → ValidationError (P-C1).

### C2 🟡 Timestamp ISO sem offset depende do fuso do servidor — clock.ts:212-216
- **Trecho:** `if (ISO_TIMESTAMP_REGEX.test(trimmed)) { const parsed = new Date(trimmed); ... fromInstant(parsed, timeZone) }`
- **Por que:** pelo ECMAScript, `YYYY-MM-DDTHH:MM:SS` **sem** `Z`/offset é hora local do processo; o mesmo texto gera instantes diferentes conforme o `TZ` do servidor.
- **Prova (P-C2, probes/clock-probe.mts):** `2026-11-04T01:00:00` → **2026-11-03** com `TZ=UTC` e **2026-11-04** com `TZ=America/Sao_Paulo`. Com offset (`Z` ou `-03:00`) o resultado é estável nos dois fusos.
- **Correção:** exigir offset (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/`).

### C3 🟡 `today()/now()` estáticos instanciam `SystemClock` — :52-54, :125-131
