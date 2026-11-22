import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_INCOME_OPTIONS,
  canMarkNonIncome,
  canMarkNonIncomeFromInbox,
  nonIncomeLabel,
  nonIncomeReasonOf,
  transactionKind,
} from '../src/lib/nonIncome.ts';

test('opções da ação "Não é renda": outra conta minha e reembolso/devolução', () => {
  assert.deepEqual(
    NON_INCOME_OPTIONS.map((o) => [o.reason, o.label]),
    [
      ['own_account', 'Veio de outra conta minha'],
      ['refund', 'Reembolso ou devolução'],
    ]
  );
  for (const o of NON_INCOME_OPTIONS) assert.ok(o.hint.length > 0);
});

test('nonIncomeReasonOf: só os motivos de não-renda; transferência e pró-labore não são', () => {
  assert.equal(nonIncomeReasonOf({ transferType: 'own_account' }), 'own_account');
  assert.equal(nonIncomeReasonOf({ transferType: 'refund' }), 'refund');
  assert.equal(nonIncomeReasonOf({ transferType: 'transfer' }), null);
  assert.equal(nonIncomeReasonOf({ transferType: 'pro_labore' }), null);
  assert.equal(nonIncomeReasonOf({ transferType: null }), null);
  assert.equal(nonIncomeReasonOf({}), null);
});

test('nonIncomeLabel', () => {
  assert.equal(nonIncomeLabel('own_account'), 'Veio de outra conta minha');
  assert.equal(nonIncomeLabel('refund'), 'Reembolso ou devolução');
});

test('transactionKind: marcada como não-renda não é tratada como transferência de duas pontas', () => {
  assert.equal(transactionKind({ transferGroupId: 'g', transferType: 'refund' }), 'non_income');
  assert.equal(transactionKind({ transferGroupId: 'g', transferType: 'transfer' }), 'transfer');
  assert.equal(transactionKind({ transferGroupId: 'g', transferType: 'pro_labore' }), 'transfer');
  assert.equal(transactionKind({ transferGroupId: 'g', transferType: null }), 'transfer');
  assert.equal(transactionKind({ transferGroupId: null, transferType: null }), 'regular');
  assert.equal(transactionKind({}), 'regular');
});

test('canMarkNonIncome: receita comum ou já marcada; nunca despesa ou perna de transferência', () => {
  assert.equal(canMarkNonIncome({ type: 'receita' }), true);
  assert.equal(canMarkNonIncome({ type: 'receita', transferGroupId: 'g', transferType: 'own_account' }), true);
  assert.equal(canMarkNonIncome({ type: 'despesa' }), false);
  assert.equal(canMarkNonIncome({ type: 'receita', transferGroupId: 'g', transferType: 'transfer' }), false);
  assert.equal(canMarkNonIncome({ type: 'receita', transferGroupId: 'g', transferType: 'pro_labore' }), false);
});

test('canMarkNonIncomeFromInbox: só entradas pendentes da fila', () => {
  assert.equal(canMarkNonIncomeFromInbox({ direction: 'in', status: 'nova' }), true);
  assert.equal(canMarkNonIncomeFromInbox({ direction: 'out', status: 'nova' }), false);
  assert.equal(canMarkNonIncomeFromInbox({ direction: 'in', status: 'importada' }), false);
  assert.equal(canMarkNonIncomeFromInbox({ direction: 'in', status: 'ignorada' }), false);
});
