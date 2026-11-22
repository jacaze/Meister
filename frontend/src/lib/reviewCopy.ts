// Textos da Fila de Revisão que dependem de o workspace ter (ou não) uma entidade PJ/MEI.

export interface EntityKindLike {
  readonly kind: string;
}

/** Há empresa (MEI ou outra PJ) no workspace? Pessoa física e autônomo sem CNPJ não contam. */
export function hasPjEntity(entities: readonly EntityKindLike[] | undefined | null): boolean {
  return (entities ?? []).some((entity) => entity.kind === 'pj');
}

export interface CopyBlock {
  readonly title: string;
  readonly description: string;
}

export function transferSuspectCopy(count: number, hasPj: boolean): CopyBlock {
  if (hasPj) {
    return {
      title: `${count} transação(ões) identificada(s) como possível transferência interna`,
      description:
        'Transações entre sua conta PJ e conta física (PF) são destacadas para que você as revise individualmente. Elas não são incluídas no botão "Aprovar Todos" para evitar distorção do seu faturamento bruto MEI.',
    };
  }
  return {
    title: `${count} transação(ões) identificada(s) como possível transferência entre suas contas`,
    description:
      'Transações de mesmo valor entre suas próprias contas são destacadas para você revisar uma a uma. Elas ficam fora do "Aprovar Todos" para não contar a mesma movimentação duas vezes.',
  };
}

export function classifyAccountsSubtitle(hasPj: boolean): string {
  return hasPj
    ? 'Assim cada lançamento cai no lugar certo: suas finanças pessoais ou a empresa.'
    : 'Assim cada lançamento cai no lugar certo.';
}
