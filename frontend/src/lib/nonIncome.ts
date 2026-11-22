// "Não é renda": entrada que não conta como renda/faturamento (outra conta própria, reembolso).
// No backend ela vira perna única de transferência: transferGroupId preenchido + transferType = motivo.

export type NonIncomeReason = 'own_account' | 'refund';

export interface NonIncomeOption {
  readonly reason: NonIncomeReason;
  readonly label: string;
  readonly hint: string;
}

export const NON_INCOME_OPTIONS: readonly NonIncomeOption[] = [
  {
    reason: 'own_account',
    label: 'Veio de outra conta minha',
    hint: 'Dinheiro seu que estava em outro banco. Fica registrado, mas não conta como renda, nos potes nem no limite MEI.',
  },
  {
    reason: 'refund',
    label: 'Reembolso ou devolução',
    hint: 'Alguém devolveu um valor ou te reembolsou. Fica registrado, mas não conta como renda, nos potes nem no limite MEI.',
  },
];

interface TransferFields {
  readonly transferGroupId?: string | null;
  readonly transferType?: string | null;
}

export function nonIncomeReasonOf(tx: TransferFields): NonIncomeReason | null {
  return tx.transferType === 'own_account' || tx.transferType === 'refund' ? tx.transferType : null;
}

export function nonIncomeLabel(reason: NonIncomeReason): string {
  return NON_INCOME_OPTIONS.find((o) => o.reason === reason)?.label ?? '';
}

/** transfer = transferência de duas pontas ou pró-labore; non_income = marcada como "não é renda". */
export function transactionKind(tx: TransferFields): 'regular' | 'transfer' | 'non_income' {
  if (nonIncomeReasonOf(tx)) return 'non_income';
  return tx.transferGroupId || tx.transferType ? 'transfer' : 'regular';
}

/** Lançamentos: receita comum pode ser marcada; já marcada pode trocar o motivo ou voltar a contar. */
export function canMarkNonIncome(tx: TransferFields & { readonly type: string }): boolean {
  return tx.type === 'receita' && transactionKind(tx) !== 'transfer';
}

/** Fila de revisão: só entradas ainda pendentes. */
export function canMarkNonIncomeFromInbox(item: { readonly direction: string; readonly status: string }): boolean {
  return item.direction === 'in' && item.status === 'nova';
}
