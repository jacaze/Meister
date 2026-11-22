import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { LocalDate, Money, formatBRL } from '../../../../shared/index.js';
import { composeDigestPoints } from '../../domain/DigestComposer.js';
import { resolveScopedEntityId } from '../EntityGuard.js';
import { excludeNonIncomeWhere, validTransactionsWhere } from '../../../ledger/public.js';

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
  monthIso?: string,
  entityId?: string
): Promise<MonthlyDigestResult> {
  const scopedEntityId = await resolveScopedEntityId(scope, entityId);
  const targetMonth = monthIso || LocalDate.today().toIsoDate().slice(0, 7);
  const parts = targetMonth.split('-');
  const year = parseInt(parts[0] || '2026', 10);
  const month = parseInt(parts[1] || '11', 10);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  // 1. Fetch transactions for the month
  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId: scope.workspaceId,
      ...(scopedEntityId ? { entityId: scopedEntityId } : {}),
      transactionDate: { gte: startOfMonth, lte: endOfMonth },
      type: { in: ['receita', 'despesa'] },
      ...validTransactionsWhere(),
      ...excludeNonIncomeWhere(),
    },
    include: { category: true },
  });

  let incomeCents = 0n;
  let expenseCents = 0n;
  const categoryTotals = new Map<string, bigint>();

  for (const t of txs) {
    const val = Money.fromDecimalString(String(t.amount)).cents;
    if (t.type === 'receita') incomeCents += val;
    else if (t.type === 'despesa') {
      expenseCents += val;
      const name = t.category?.name ?? 'Sem categoria';
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0n) + val);
    }
  }

  const netCents = incomeCents - expenseCents;

  // 2. Insights deste período (da entidade pedida, ou do workspace quando não há filtro)
  const insights = await prisma.insight.findMany({
    where: {
      workspaceId: scope.workspaceId,
      ...(scopedEntityId ? { entityId: scopedEntityId } : {}),
      period: targetMonth,
      status: { not: 'dispensada' },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  let topExpenseCategory: { name: string; cents: bigint } | undefined;
  for (const [name, cents] of categoryTotals.entries()) {
    if (!topExpenseCategory || cents > topExpenseCategory.cents) topExpenseCategory = { name, cents };
  }

  const points = composeDigestPoints({
    attentionTexts: insights
      .filter((i) => i.severity === 'alerta' || i.severity === 'atencao')
      .map((i) => i.narrationText),
    infoTexts: insights.filter((i) => i.severity === 'info').map((i) => i.narrationText),
    transactionCount: txs.length,
    incomeCents,
    expenseCents,
    topExpenseCategory,
  });

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const label = `${monthNames[month - 1]} de ${year}`;

  return {
    month: targetMonth,
    label,
    totalIncome: formatBRL(incomeCents),
    totalExpense: formatBRL(expenseCents),
    netResult: `${netCents >= 0n ? '+' : ''}${formatBRL(netCents)}`,
    isPositive: netCents >= 0n,
    points,
  };
}
