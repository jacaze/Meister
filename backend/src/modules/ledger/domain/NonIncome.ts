/**
 * "Não é renda": entrada que não é renda nem faturamento — dinheiro vindo de outra conta do próprio
 * usuário (banco não conectado) ou reembolso/devolução de alguém. É gravada como perna única de
 * transferência (`transfer_group_id` próprio + `transfer_type` = motivo), o mesmo marcador que já tira
 * transferências do dashboard, do limite MEI, dos totais de lançamentos e da base dos potes.
 */
export const NON_INCOME_REASONS = ['own_account', 'refund'] as const;
export type NonIncomeReason = (typeof NON_INCOME_REASONS)[number];

/** `transfer_type` que não contam como renda. Pró-labore fica de fora: é renda da PF. */
export const TRANSFER_TYPES_NOT_INCOME = ['transfer', ...NON_INCOME_REASONS] as const;

export function isNonIncomeReason(value: string | null | undefined): value is NonIncomeReason {
  return (NON_INCOME_REASONS as readonly string[]).includes(value ?? '');
}

export interface NonIncomeCurrent {
  readonly type: string; // receita | despesa
  readonly transferType: string | null;
  readonly transferGroupId: string | null;
}

export type NonIncomeRejection = 'NON_INCOME_ONLY_FOR_INCOME' | 'NON_INCOME_TRANSFER_LEG';

export type NonIncomeDecision =
  | { readonly kind: 'mark'; readonly reason: NonIncomeReason; readonly groupId: string | null }
  | { readonly kind: 'unmark' }
  | { readonly kind: 'noop' }
  | { readonly kind: 'reject'; readonly code: NonIncomeRejection };

/**
 * Decide o que fazer ao marcar (`reason`) ou desmarcar (`null`) um lançamento.
 * `groupId` nulo em `mark` = criar um grupo novo; preenchido = manter o grupo da marcação anterior.
 */
export function decideNonIncome(current: NonIncomeCurrent, reason: NonIncomeReason | null): NonIncomeDecision {
  const marked = isNonIncomeReason(current.transferType);
  // Perna de transferência de verdade (duas pontas, pró-labore ou grupo legado sem tipo): não mexe
  if (!marked && (current.transferGroupId !== null || current.transferType !== null)) {
    return { kind: 'reject', code: 'NON_INCOME_TRANSFER_LEG' };
  }
  if (reason === null) {
    return marked ? { kind: 'unmark' } : { kind: 'noop' };
  }
  if (current.type !== 'receita') {
    return { kind: 'reject', code: 'NON_INCOME_ONLY_FOR_INCOME' };
  }
  if (current.transferType === reason) {
    return { kind: 'noop' };
  }
  return { kind: 'mark', reason, groupId: marked ? current.transferGroupId : null };
}
