import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLocalIsoDate } from '../src/lib/date.ts';

test('toLocalIsoDate: 22h30 em São Paulo continua sendo o mesmo dia', () => {
  process.env.TZ = 'America/Sao_Paulo';
  // 2026-11-06T01:30Z = 2026-11-05 22:30 no horário de Brasília
  assert.equal(toLocalIsoDate(new Date('2026-11-06T01:30:00Z')), '2026-11-05');
  assert.equal(new Date('2026-11-06T01:30:00Z').toISOString().slice(0, 10), '2026-11-06');
});
