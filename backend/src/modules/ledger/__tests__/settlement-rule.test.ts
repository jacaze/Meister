import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Money } from '../../../shared/index.js';
import { settlementFor } from '../domain/SettlementRule.js';

// Tarefa 18: quando a entidade dona do lançamento não é a que pagou/recebeu o dinheiro, nasce um acerto.
describe('SettlementRule', () => {
  const amount = Money.fromDecimalString('150.00');

  it('despesa da empresa paga pela PF: a empresa deve à PF', () => {
    expect(settlementFor({ type: 'despesa', entityId: 'pj', paidByEntityId: 'pf', amount })).toEqual({
      debtorEntityId: 'pj',
      creditorEntityId: 'pf',
      amount,
    });
  });

  it('receita da empresa que caiu na conta da PF: a PF deve à empresa', () => {
    expect(settlementFor({ type: 'receita', entityId: 'pj', paidByEntityId: 'pf', amount })).toEqual({
      debtorEntityId: 'pf',
      creditorEntityId: 'pj',
      amount,
    });
  });

  it('sem pagador ou com o mesmo pagador: não há acerto', () => {
    expect(settlementFor({ type: 'despesa', entityId: 'pj', paidByEntityId: null, amount })).toBeNull();
    expect(settlementFor({ type: 'despesa', entityId: 'pj', paidByEntityId: 'pj', amount })).toBeNull();
  });

  it('transferência e valor zero não geram acerto', () => {
    expect(settlementFor({ type: 'transferencia', entityId: 'pj', paidByEntityId: 'pf', amount })).toBeNull();
    expect(settlementFor({ type: 'despesa', entityId: 'pj', paidByEntityId: 'pf', amount: Money.zero() })).toBeNull();
  });

  it('propriedade: devedor ≠ credor, valor preservado, e trocar o tipo inverte o par', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10_000_000_00n }),
        fc.constantFrom('pf', 'pj', 'aut'),
        fc.constantFrom('pf', 'pj', 'aut'),
        (cents, owner, payer) => {
          fc.pre(owner !== payer);
          const value = Money.fromCents(cents);
          const expense = settlementFor({ type: 'despesa', entityId: owner, paidByEntityId: payer, amount: value })!;
          const income = settlementFor({ type: 'receita', entityId: owner, paidByEntityId: payer, amount: value })!;
          expect(expense.debtorEntityId).not.toBe(expense.creditorEntityId);
          expect(expense.amount.equals(value)).toBe(true);
          expect(income.debtorEntityId).toBe(expense.creditorEntityId);
          expect(income.creditorEntityId).toBe(expense.debtorEntityId);
        }
      )
    );
  });
});
