import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settlementHint } from '../src/lib/settlementHint.ts';

const clinica = { id: 'pj', kind: 'pj', name: 'Clínica' };
const pessoal = { id: 'pf', kind: 'pf', name: 'Pessoal' };

test('settlementHint: despesa da empresa paga com a PF → a empresa deve à PF', () => {
  assert.equal(settlementHint('despesa', clinica, pessoal), 'Vai gerar um acerto: Clínica deve a Pessoal.');
});

test('settlementHint: receita da empresa recebida na PF → a PF deve à empresa', () => {
  assert.equal(settlementHint('receita', clinica, pessoal), 'Vai gerar um acerto: Pessoal deve a Clínica.');
});

test('settlementHint: sem pagador ou mesmo pagador → sem aviso', () => {
  assert.equal(settlementHint('despesa', clinica, undefined), null);
  assert.equal(settlementHint('despesa', clinica, clinica), null);
  assert.equal(settlementHint('despesa', undefined, pessoal), null);
});
