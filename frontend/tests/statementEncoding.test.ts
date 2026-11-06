import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeStatement } from '../src/lib/statementEncoding.ts';

const header1252 = 'OFXHEADER:100\nENCODING:USASCII\nCHARSET:1252\n';
const memo = 'JOÃO – AÇÚCAR € 10';

test('UTF-8 que declara CHARSET:1252 continua UTF-8', () => {
  const bytes = new TextEncoder().encode(header1252 + memo);
  assert.ok(decodeStatement(bytes).endsWith(memo));
});

test('UTF-8 com BOM, mesmo com cabeçalho 1252', () => {
  const body = new TextEncoder().encode(header1252 + memo);
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
  const text = decodeStatement(bytes);
  assert.ok(text.startsWith('OFXHEADER'));
  assert.ok(text.endsWith(memo));
});

test('cp1252 real (– e € fora do latin1)', () => {
  // "JOÃO – AÇÚCAR € 10" em windows-1252
  const cp1252 = [0x4a, 0x4f, 0xc3, 0x4f, 0x20, 0x96, 0x20, 0x41, 0xc7, 0xda, 0x43, 0x41, 0x52, 0x20, 0x80, 0x20, 0x31, 0x30];
  const bytes = new Uint8Array([...new TextEncoder().encode(header1252), ...cp1252]);
  assert.ok(decodeStatement(bytes).endsWith(memo));
});

test('ASCII puro', () => {
  assert.equal(decodeStatement(new TextEncoder().encode('DATA;VALOR\n01/11;10,00')), 'DATA;VALOR\n01/11;10,00');
});
