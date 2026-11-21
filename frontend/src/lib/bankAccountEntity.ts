// De qual entidade (pessoal ou empresa) é cada conta bancária importada.

export interface EntityOption {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly tradeName?: string | null;
}

export function entityLabel(entity: EntityOption): string {
  if (entity.kind === 'pf') return 'Pessoal';
  return entity.tradeName?.trim() || entity.name.trim() || 'Empresa';
}

export function accountsWithoutEntity<T extends { readonly entityId: string | null }>(accounts: readonly T[]): T[] {
  return accounts.filter((account) => !account.entityId);
}

export function missingSelections(
  accounts: ReadonlyArray<{ readonly id: string }>,
  selections: Readonly<Record<string, string>>
): string[] {
  return accounts.filter((account) => !selections[account.id]).map((account) => account.id);
}
