import { formatBRL, formatPercent } from '../../../shared/index.js';

export const DIGEST_MAX_POINTS = 3;

export interface DigestInput {
  readonly attentionTexts: readonly string[];
  readonly infoTexts: readonly string[];
  readonly transactionCount: number;
  readonly incomeCents: bigint;
  readonly expenseCents: bigint;
  readonly topExpenseCategory?: { readonly name: string; readonly cents: bigint };
}

/**
 * Seleciona até 3 pontos úteis: insights de atenção/alerta (máx. 2), depois informativos e, se ainda
 * faltar, o resumo do período (receitas, despesas e resultado) e a maior categoria de despesa.
 */
export function composeDigestPoints(input: DigestInput): string[] {
  const points: string[] = [];
  for (const text of input.attentionTexts.slice(0, 2)) points.push(text);
  for (const text of input.infoTexts) {
    if (points.length >= DIGEST_MAX_POINTS) break;
    points.push(text);
  }

  const hasMovement = input.incomeCents > 0n || input.expenseCents > 0n;
  if (!hasMovement) {
    if (points.length === 0) points.push('Nenhuma movimentação relevante identificada para este mês ainda.');
    return points;
  }

  if (points.length < DIGEST_MAX_POINTS) {
    const net = input.incomeCents - input.expenseCents;
    const plural = input.transactionCount === 1 ? 'transação' : 'transações';
    points.push(
      `Você registrou ${input.transactionCount} ${plural} no período: receitas de ${formatBRL(input.incomeCents)}, despesas de ${formatBRL(input.expenseCents)} e resultado de ${formatBRL(net)}.`
    );
  }

  const top = input.topExpenseCategory;
  if (points.length < DIGEST_MAX_POINTS && top && input.expenseCents > 0n) {
    const share = (Number(top.cents) / Number(input.expenseCents)) * 100;
    points.push(
      `Sua maior categoria de despesa foi ${top.name}, com ${formatBRL(top.cents)} (${formatPercent(share)} das despesas).`
    );
  }

  return points;
}
