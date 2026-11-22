import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAccountsSubtitle, hasPjEntity, transferSuspectCopy } from '../src/lib/reviewCopy.ts';

const PJ_WORDS = /\b(PJ|MEI|empresa|faturamento)\b/i;

test('hasPjEntity: só PF ou autônomo não tem PJ; pj tem', () => {
  assert.equal(hasPjEntity([]), false);
  assert.equal(hasPjEntity([{ kind: 'pf' }]), false);
  assert.equal(hasPjEntity([{ kind: 'pf' }, { kind: 'autonomo' }]), false);
  assert.equal(hasPjEntity([{ kind: 'pf' }, { kind: 'pj' }]), true);
});

test('transferSuspectCopy sem PJ: nada de PJ/MEI/faturamento', () => {
  const copy = transferSuspectCopy(2, false);
  assert.equal(
    copy.description,
    'Transações de mesmo valor entre suas próprias contas são destacadas para você revisar uma a uma. Elas ficam fora do "Aprovar Todos" para não contar a mesma movimentação duas vezes.'
  );
  assert.doesNotMatch(copy.title, PJ_WORDS);
  assert.doesNotMatch(copy.description, PJ_WORDS);
  assert.match(copy.title, /^2 transação/);
});

test('transferSuspectCopy com PJ: mantém PJ/PF e faturamento MEI', () => {
  const copy = transferSuspectCopy(1, true);
  assert.match(copy.description, /conta PJ e conta física \(PF\)/);
  assert.match(copy.description, /faturamento bruto MEI/);
  assert.match(copy.title, /^1 transação/);
});

test('classifyAccountsSubtitle: menção à empresa só com PJ', () => {
  assert.match(classifyAccountsSubtitle(true), /a empresa/);
  assert.doesNotMatch(classifyAccountsSubtitle(false), PJ_WORDS);
});
