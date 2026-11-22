import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentMonthRange, monthRange, shiftMonth, rangeAsMonth, periodLabel, saoPauloMonth,
} from '../src/lib/period.ts';

test('mês atual em São Paulo: 01h UTC do dia 1 ainda é o mês anterior', () => {
  assert.equal(saoPauloMonth(new Date('2026-12-01T01:00:00Z')), '2026-11');
  assert.deepEqual(currentMonthRange(new Date('2026-11-22T15:00:00Z')), { start: '2026-11-01', end: '2026-11-30' });
});

test('monthRange: fevereiro bissexto e não bissexto', () => {
  assert.equal(monthRange('2028-02').end, '2028-02-29');
  assert.equal(monthRange('2026-02').end, '2026-02-28');
});

test('shiftMonth: vira o ano nos dois sentidos', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', -3), '2026-08');
});

test('rangeAsMonth: só reconhece mês inteiro', () => {
  assert.equal(rangeAsMonth('2026-11-01', '2026-11-30'), '2026-11');
  assert.equal(rangeAsMonth('2026-11-01', '2026-11-15'), null);
  assert.equal(rangeAsMonth('', ''), null);
});

test('periodLabel descreve o período', () => {
  assert.equal(periodLabel('2026-11-01', '2026-11-30'), 'Novembro de 2026');
  assert.equal(periodLabel('2026-08-01', '2026-11-30'), '01/08/2026 a 30/11/2026');
  assert.equal(periodLabel('', ''), 'Todo o período');
  assert.equal(periodLabel('2026-08-05', ''), 'A partir de 05/08/2026');
  assert.equal(periodLabel('', '2026-08-05'), 'Até 05/08/2026');
});
