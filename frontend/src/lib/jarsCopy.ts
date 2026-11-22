/** Textos e regras de exibição da tela de potes. */

// Regra única de "tem PJ" (entidade kind 'pj'), compartilhada com a Fila de Revisão.
export { hasPjEntity } from './reviewCopy.ts';

interface JarRule {
  readonly percent?: number | null;
  readonly fixedAmount?: string | null;
}

/** Regra do pote: "X% do faturamento" (com PJ) ou "X% da renda" (só pessoa física). */
export function jarRuleLabel(
  jar: JarRule,
  hasPj: boolean,
  formatMoney: (v: string) => string,
): string {
  if (jar.percent !== null && jar.percent !== undefined) {
    return `${jar.percent}% ${hasPj ? 'do faturamento' : 'da renda'}`;
  }
  if (jar.fixedAmount) return `${formatMoney(jar.fixedAmount)} fixo`;
  return 'Meta personalizada';
}

export function baseModeLabel(mode: string | undefined, hasPj: boolean): string {
  const base = hasPj ? 'Faturamento' : 'Renda';
  switch (mode) {
    case 'mes_atual':
      return `${base} deste mês (tempo real)`;
    case 'mes_anterior':
      return `${base} do mês anterior`;
    case 'media_3_meses':
      return 'Média dos últimos 3 meses';
    default:
      return mode || base;
  }
}

/**
 * A API não informa se o plano foi personalizado: `GetJarsStatus` cria o plano padrão
 * (PJ → 'mei-empresa', demais → 'seis-potes') na primeira visita e devolve só `templateSlug`.
 * Sinal usado: o plano ainda está no template que o backend escolheria sozinho.
 */
export function isDefaultSuggestedPlan(
  templateSlug: string | undefined,
  entityKind: string | undefined,
): boolean {
  if (!templateSlug) return false;
  return templateSlug === (entityKind === 'pj' ? 'mei-empresa' : 'seis-potes');
}

/** "55/10/10/10/10/5" a partir dos potes com percentual. */
export function suggestedSplit(jars: readonly JarRule[]): string {
  return jars
    .filter((j) => j.percent !== null && j.percent !== undefined)
    .map((j) => String(j.percent))
    .join('/');
}

export function suggestedPlanNotice(jars: readonly JarRule[]): string {
  const split = suggestedSplit(jars);
  return `Criamos uma divisão sugerida${split ? ` (${split})` : ''}. Ajuste as porcentagens e categorias como preferir.`;
}

export function suggestedNoticeStorageKey(planId: string): string {
  return `meister_jars_suggestion_ack_${planId}`;
}
