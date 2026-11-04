import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { Money } from '../../../../shared/index.js';

export interface MonthlyDigestResult {
  readonly month: string; // 'YYYY-MM'
  readonly label: string;
  readonly totalIncome: string;
  readonly totalExpense: string;
  readonly netResult: string;
  readonly isPositive: boolean;
  readonly points: readonly string[];
}

export async function buildMonthlyDigest(
  scope: WorkspaceScope,
  monthIso?: string
): Promise<MonthlyDigestResult> {
  const targetMonth = monthIso || new Date().toISOString().slice(0, 7);
  const parts = targetMonth.split('-');
  const year = parseInt(parts[0] || '2026', 10);
  const month = parseInt(parts[1] || '11', 10);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  // 1. Fetch transactions for the month
  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId: scope.workspaceId,
      transactionDate: { gte: startOfMonth, lte: endOfMonth },
      type: { in: ['receita', 'despesa'] },
    },
  });

  let incomeCents = 0n;
  let expenseCents = 0n;

  for (const t of txs) {
    const val = Money.fromDecimalString(String(t.amount)).cents;
    if (t.type === 'receita') incomeCents += val;
    else if (t.type === 'despesa') expenseCents += val;
  }

  const netCents = incomeCents - expenseCents;
  const incomeMoney = Money.fromCents(incomeCents);
  const expenseMoney = Money.fromCents(expenseCents);
  const netMoney = Money.fromCents(netCents < 0n ? -netCents : netCents);
  const netSign = netCents < 0n ? '-' : '+';

  // 2. Fetch insights for this period
  const insights = await prisma.insight.findMany({
    where: {
      workspaceId: scope.workspaceId,
      period: targetMonth,
      status: { not: 'dispensada' },
    },
    take: 10,
  });

  const points: string[] = [];

  // Top critical/attention insights
  const attentionInsights = insights.filter((i) => i.severity === 'alerta' || i.severity === 'atencao');
  for (const ai of attentionInsights.slice(0, 2)) {
    points.push(ai.narrationText);
  }

  // Positive highlight or informative insight
  const infoInsights = insights.filter((i) => i.severity === 'info');
  for (const ii of infoInsights.slice(0, 3 - points.length)) {
    points.push(ii.narrationText);
  }

  // Fallback points if fewer than 3 findings
  if (points.length === 0) {
    if (incomeCents > 0n || expenseCents > 0n) {
      points.push(`Você registrou ${txs.length} transações no período, gerando uma movimentação total de R$ ${incomeMoney.toDecimalString().replace('.', ',')}.`);
    } else {
      points.push('Nenhuma movimentação relevante identificada para este mês ainda.');
    }
  }

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const label = `${monthNames[month - 1]} de ${year}`;

  return {
    month: targetMonth,
    label,
    totalIncome: `R$ ${incomeMoney.toDecimalString().replace('.', ',')}`,
    totalExpense: `R$ ${expenseMoney.toDecimalString().replace('.', ',')}`,
    netResult: `${netSign}R$ ${netMoney.toDecimalString().replace('.', ',')}`,
    isPositive: netCents >= 0n,
    points,
  };
}
