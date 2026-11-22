import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  NON_INCOME_REASONS,
  TRANSFER_TYPES_NOT_INCOME,
  decideNonIncome,
  isNonIncomeReason,
  type NonIncomeCurrent,
} from '../domain/NonIncome.js';

// "Não é renda": entrada que não é renda (dinheiro de outra conta própria fora do app, reembolso)
// vira perna única de transferência e sai de receita, potes e limite MEI.
describe('NonIncome', () => {
  const receitaComum: NonIncomeCurrent = { type: 'receita', transferType: null, transferGroupId: null };

  it('motivos aceitos: veio de outra conta minha e reembolso/devolução', () => {
    expect(NON_INCOME_REASONS).toEqual(['own_account', 'refund']);
    expect(isNonIncomeReason('own_account')).toBe(true);
    expect(isNonIncomeReason('refund')).toBe(true);
    expect(isNonIncomeReason('transfer')).toBe(false);
    expect(isNonIncomeReason('pro_labore')).toBe(false);
    expect(isNonIncomeReason(null)).toBe(false);
    expect(isNonIncomeReason(undefined)).toBe(false);
  });

  it('tipos que não contam como renda: transferência entre contas e os motivos de não-renda (pró-labore conta)', () => {
    expect(TRANSFER_TYPES_NOT_INCOME).toEqual(['transfer', 'own_account', 'refund']);
    expect(TRANSFER_TYPES_NOT_INCOME).not.toContain('pro_labore');
  });

  it('marca uma receita comum: novo grupo de perna única', () => {
    expect(decideNonIncome(receitaComum, 'own_account')).toEqual({ kind: 'mark', reason: 'own_account', groupId: null });
    expect(decideNonIncome(receitaComum, 'refund')).toEqual({ kind: 'mark', reason: 'refund', groupId: null });
  });

  it('troca o motivo mantendo o grupo já criado', () => {
    const marcada: NonIncomeCurrent = { type: 'receita', transferType: 'own_account', transferGroupId: 'g1' };
    expect(decideNonIncome(marcada, 'refund')).toEqual({ kind: 'mark', reason: 'refund', groupId: 'g1' });
  });

  it('mesmo motivo de novo não muda nada', () => {
    const marcada: NonIncomeCurrent = { type: 'receita', transferType: 'refund', transferGroupId: 'g1' };
    expect(decideNonIncome(marcada, 'refund')).toEqual({ kind: 'noop' });
  });

  it('desmarcar volta a ser receita comum; desmarcar o que não está marcado não muda nada', () => {
    const marcada: NonIncomeCurrent = { type: 'receita', transferType: 'own_account', transferGroupId: 'g1' };
    expect(decideNonIncome(marcada, null)).toEqual({ kind: 'unmark' });
    expect(decideNonIncome(receitaComum, null)).toEqual({ kind: 'noop' });
  });

  it('despesa não pode ser marcada como não-renda', () => {
    const despesa: NonIncomeCurrent = { type: 'despesa', transferType: null, transferGroupId: null };
    expect(decideNonIncome(despesa, 'refund')).toEqual({ kind: 'reject', code: 'NON_INCOME_ONLY_FOR_INCOME' });
  });

  it('perna de transferência de duas pontas ou pró-labore não é tocada (nem para marcar, nem para desmarcar)', () => {
    for (const transferType of ['transfer', 'pro_labore'] as const) {
      const perna: NonIncomeCurrent = { type: 'receita', transferType, transferGroupId: 'g1' };
      expect(decideNonIncome(perna, 'own_account')).toEqual({ kind: 'reject', code: 'NON_INCOME_TRANSFER_LEG' });
      expect(decideNonIncome(perna, null)).toEqual({ kind: 'reject', code: 'NON_INCOME_TRANSFER_LEG' });
    }
    // Grupo sem tipo (dado legado): trata como perna de transferência
    const legado: NonIncomeCurrent = { type: 'receita', transferType: null, transferGroupId: 'g1' };
    expect(decideNonIncome(legado, 'refund')).toEqual({ kind: 'reject', code: 'NON_INCOME_TRANSFER_LEG' });
    // Tipo de transferência sem grupo (dado inconsistente): também não mexe
    const semGrupo: NonIncomeCurrent = { type: 'receita', transferType: 'pro_labore', transferGroupId: null };
    expect(decideNonIncome(semGrupo, 'refund')).toEqual({ kind: 'reject', code: 'NON_INCOME_TRANSFER_LEG' });
  });

  it('propriedade: marcar e depois desmarcar sempre é permitido numa receita comum', () => {
    fc.assert(
      fc.property(fc.constantFrom(...NON_INCOME_REASONS), (reason) => {
        const marcar = decideNonIncome(receitaComum, reason);
        expect(marcar.kind).toBe('mark');
        const marcada: NonIncomeCurrent = { type: 'receita', transferType: reason, transferGroupId: 'g' };
        expect(decideNonIncome(marcada, null)).toEqual({ kind: 'unmark' });
      })
    );
  });
});
