import type { Money } from '../../../shared/index.js';

export interface SettlementInput {
  readonly type: string; // receita | despesa | transferencia
  readonly entityId: string; // entidade dona do lançamento
  readonly paidByEntityId: string | null; // entidade cujo dinheiro pagou/recebeu
  readonly amount: Money;
}

export interface SettlementTerms {
  readonly debtorEntityId: string;
  readonly creditorEntityId: string;
  readonly amount: Money;
}

/**
 * Despesa de A paga com dinheiro de B: A deve a B. Receita de A que caiu no dinheiro de B: B deve a A.
 * Sem pagador, mesmo pagador, transferência ou valor zero: não há acerto.
 */
export function settlementFor(input: SettlementInput): SettlementTerms | null {
  const payer = input.paidByEntityId;
  if (!payer || payer === input.entityId || !input.amount.isPositive()) return null;
  if (input.type === 'despesa') {
    return { debtorEntityId: input.entityId, creditorEntityId: payer, amount: input.amount };
  }
  if (input.type === 'receita') {
    return { debtorEntityId: payer, creditorEntityId: input.entityId, amount: input.amount };
  }
  return null;
}
