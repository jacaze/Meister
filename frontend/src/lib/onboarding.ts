// Perfil do primeiro acesso (tarefa 17): qual é o caso e quais negócios existem.

export type WorkspaceProfile = 'individual' | 'negocio' | 'familia' | 'familia_negocio';
export type BusinessType = 'mei' | 'pj' | 'autonomo';

export interface BusinessDraft {
  readonly type: BusinessType;
  readonly name: string;
}

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  mei: 'MEI',
  pj: 'Outra empresa (PJ)',
  autonomo: 'Autônomo (sem CNPJ)',
};

export function needsBusiness(profile: WorkspaceProfile): boolean {
  return profile === 'negocio' || profile === 'familia_negocio';
}

/**
 * Valida o formulário antes de enviar. A última linha costuma ficar vazia (para adicionar outra), então
 * linhas totalmente vazias são descartadas; só sobra erro quando não há negócio nenhum.
 */
export function validateOnboarding(
  profile: WorkspaceProfile,
  drafts: readonly BusinessDraft[],
  existingBusinessCount: number
): { businesses: BusinessDraft[]; error?: string } {
  if (!needsBusiness(profile)) return { businesses: [] };
  const businesses = drafts
    .map((d) => ({ type: d.type, name: d.name.trim() }))
    .filter((d) => d.name.length > 0);
  if (businesses.length + existingBusinessCount === 0) {
    return { businesses, error: 'Adicione ao menos um negócio com nome.' };
  }
  return { businesses };
}
