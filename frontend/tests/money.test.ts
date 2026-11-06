import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, parseBRL, parseDecimal, toCents } from '../src/lib/money.ts';

test('parseBRL: ponto de milhar brasileiro', () => {
  assert.equal(parseBRL('1.500'), 1500);
  assert.equal(parseBRL('R$ 1.500'), 1500);
  assert.equal(parseBRL('1.234.567'), 1234567);
  assert.equal(parseBRL('12.345'), 12345);
});

test('parseBRL: vírgula decimal', () => {
  assert.equal(parseBRL('1.234,56'), 1234.56);
  assert.equal(parseBRL('1.000.000,00'), 1000000);
  assert.equal(parseBRL('1,5'), 1.5);
  assert.equal(parseBRL('R$ 50,00'), 50);
  assert.equal(parseBRL('R$ 1.500,25'), 1500.25);
});

test('parseBRL: ponto decimal quando não é grupo de milhar', () => {
  assert.equal(parseBRL('1234.56'), 1234.56);
  assert.equal(parseBRL('1.5'), 1.5);
  assert.equal(parseBRL('1.50'), 1.5);
  assert.equal(parseBRL('0.500'), 0.5);
});

test('parseBRL: sinal negativo só no início', () => {
  assert.equal(parseBRL('R$ -10'), -10);
  assert.equal(parseBRL('-R$ 10,50'), -10.5);
  assert.equal(parseBRL('(10,00)'), -10);
  assert.ok(Number.isNaN(parseBRL('1-2')));
});

test('parseBRL: vazio é 0 e inválido é NaN', () => {
  assert.equal(parseBRL(''), 0);
  assert.equal(parseBRL('   '), 0);
  assert.equal(parseBRL(null), 0);
  for (const bad of ['abc', '2.5e3', '1,2,3', '1.23,45', '1,', '1.', '1.2.3']) {
    assert.ok(Number.isNaN(parseBRL(bad)), bad);
  }
});

test('parseDecimal: formato da API', () => {
  assert.equal(parseDecimal('4500.00'), 4500);
  assert.equal(parseDecimal('1.500'), 1.5);
  assert.equal(parseDecimal(12.3), 12.3);
  assert.equal(parseDecimal('abc'), 0);
});

test('formatBRL: API e digitação', () => {
  const nb = (s: string) => s.replace(/\s/g, ' ');
  assert.equal(nb(formatBRL('4500.00')), 'R$ 4.500,00');
  assert.equal(nb(formatBRL('1.500')), 'R$ 1,50');
  assert.equal(nb(formatBRL('1.234,56')), 'R$ 1.234,56');
  assert.equal(nb(formatBRL(null)), 'R$ 0,00');
});

test('toCents: arredonda meio centavo para cima sem erro de float', () => {
  assert.equal(toCents('1,005'), 101n);
  assert.equal(toCents('0,005'), 1n);
  assert.equal(toCents('1.234,56'), 123456n);
  assert.equal(toCents('4500.00'), 450000n);
  assert.equal(toCents(1.005), 101n);
  assert.equal(toCents('-10,50'), -1050n);
  assert.equal(toCents('abc'), 0n);
});
