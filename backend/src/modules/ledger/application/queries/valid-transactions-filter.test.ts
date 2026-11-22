import { describe, expect, it } from 'vitest';
import { validTransactionsWhere } from './valid-transactions-filter.js';
import { excludeNonIncomeWhere } from './income-filter.js';

describe('validTransactionsWhere', () => {
  it('exclui apagados e não confirmados', () => {
    expect(validTransactionsWhere()).toEqual({ deletedAt: null, status: 'confirmado' });
  });

  it('combina com excludeNonIncomeWhere sem sobrescrever chaves', () => {
    const w = { ...validTransactionsWhere(), ...excludeNonIncomeWhere() };
    expect(Object.keys(w).sort()).toEqual(['OR', 'deletedAt', 'status']);
  });
});
