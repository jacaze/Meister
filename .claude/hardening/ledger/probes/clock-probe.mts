import { LocalDate } from '../../../../backend/src/shared/clock.ts';
for (const s of ['2026-11-04T01:00:00', '2026-11-04T01:00:00Z', '2026-11-04T01:00:00-03:00']) {
  try { console.log(s.padEnd(28), '->', LocalDate.fromInput(s).toIsoDate()); } catch (e) { console.log(s.padEnd(28), '-> ERRO', (e as Error).message); }
}
