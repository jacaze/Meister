import type { Prisma, TransactionType } from '@prisma/client';
import prisma from '../config/prisma.js';
import {
  type Clock,
  DEFAULT_TIMEZONE,
  LocalDate,
  Money,
  NotFoundError,
  SystemClock,
  YearMonth,
  assertAuthenticated,
} from '../shared/index.js';

const DEFAULT_MEI_ANNUAL_LIMIT = Number(process.env.MEI_ANNUAL_LIMIT) || 81000;
const MEI_TOLERANCE = 0.2;
const ATTENTION_THRESHOLD = 0.8;
const EVOLUTION_MONTHS_DEFAULT = 6;

const defaultClock = new SystemClock();

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  months?: string | number;
}

export function resolvePeriod(
  filters: DashboardFilters,
  clock: Clock = defaultClock,
  timeZone = DEFAULT_TIMEZONE
): { start: Date | null; end: Date | null } {
  const { startDate, endDate } = filters;

  if (!startDate && !endDate) {
    const currentYm = clock.currentYearMonth(timeZone);
    return {
      start: currentYm.startOfMonth().toUtcDate(),
      end: currentYm.endOfMonth().toUtcEndOfDay(),
    };
  }

  return {
    start: startDate ? LocalDate.fromInput(startDate, { label: 'startDate', timeZone }).toUtcDate() : null,
    end: endDate ? LocalDate.fromInput(endDate, { label: 'endDate', timeZone }).toUtcEndOfDay() : null,
  };
}

function buildWhere(
  userId: string,
  { start, end, categoryId }: { start?: Date | null; end?: Date | null; categoryId?: string } = {}
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };

  if (categoryId) where.categoryId = categoryId;

  if (start || end) {
    where.transactionDate = {};
    if (start) where.transactionDate.gte = start;
    if (end) where.transactionDate.lte = end;
  }

  return where;
}

function aggregateToMoney(aggregate: { _sum: { amount: Prisma.Decimal | null } }): Money {
  const raw = aggregate._sum.amount;
  if (!raw) return Money.zero();
  return Money.fromDecimalString(raw.toFixed(2));
}

export function buildMeiLimit(revenueYearMoney: Money, year: number, annualLimit = DEFAULT_MEI_ANNUAL_LIMIT) {
  const limitMoney = Money.fromInput(annualLimit);
  const limitWithToleranceMoney = limitMoney.mulRatio(120, 100);
  const attentionThresholdMoney = limitMoney.mulRatio(80, 100);

  let status: 'ok' | 'atencao' | 'excedido' | 'desenquadramento' = 'ok';
  if (revenueYearMoney.compare(limitWithToleranceMoney) > 0) {
    status = 'desenquadramento';
  } else if (revenueYearMoney.compare(limitMoney) > 0) {
    status = 'excedido';
  } else if (revenueYearMoney.compare(attentionThresholdMoney) >= 0) {
    status = 'atencao';
  }

  const revenueNum = revenueYearMoney.toNumber();
  const limitNum = limitMoney.toNumber();
  const restanteCents =
    limitMoney.cents > revenueYearMoney.cents ? limitMoney.cents - revenueYearMoney.cents : 0n;

  return {
    ano: year,
    limite: limitNum,
    limiteComTolerancia: limitWithToleranceMoney.toNumber(),
    faturamentoAno: revenueNum,
    percentualUtilizado: limitNum > 0 ? round2((revenueNum / limitNum) * 100) : 0,
    restante: Money.centsToNumber(restanteCents),
    status,
  };
}

function buildCategoryBreakdown(
  groups: {
    categoryId: string;
    type: TransactionType;
    _sum: { amount: Prisma.Decimal | null };
    _count: { _all: number };
  }[],
  categoriesById: Map<string, string>
) {
  const result: {
    receitas: {
      categoryId: string;
      nome: string;
      total: number;
      quantidade: number;
      percentual: number;
    }[];
    despesas: {
      categoryId: string;
      nome: string;
      total: number;
      quantidade: number;
      percentual: number;
    }[];
  } = { receitas: [], despesas: [] };

  for (const type of ['receita', 'despesa'] as const) {
    const items = groups.filter((group) => group.type === type);
    let totalMoney = Money.zero();
    for (const group of items) {
      const m = group._sum.amount
        ? Money.fromDecimalString(group._sum.amount.toFixed(2))
        : Money.zero();
      totalMoney = totalMoney.add(m);
    }

    const totalNum = totalMoney.toNumber();

    const list = items
      .map((group) => {
        const itemMoney = group._sum.amount
          ? Money.fromDecimalString(group._sum.amount.toFixed(2))
          : Money.zero();
        const amountNum = itemMoney.toNumber();
        return {
          categoryId: group.categoryId,
          nome: categoriesById.get(group.categoryId) || 'Sem categoria',
          total: amountNum,
          quantidade: group._count._all,
          percentual: totalNum > 0 ? round2((amountNum / totalNum) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    result[type === 'receita' ? 'receitas' : 'despesas'] = list;
  }

  return result;
}

export function buildMonthlySeries(
  transactions: { type: TransactionType; amount: Prisma.Decimal | string | number; transactionDate: Date }[],
  months: number,
  currentYm: YearMonth
) {
  const buckets = new Map<string, { mes: string; receitasCents: bigint; despesasCents: bigint }>();

  for (let i = months - 1; i >= 0; i -= 1) {
    const ym = currentYm.addMonths(-i);
    const key = ym.toString();
    buckets.set(key, { mes: key, receitasCents: 0n, despesasCents: 0n });
  }

  for (const transaction of transactions) {
    const localDate = LocalDate.fromInput(transaction.transactionDate, { isPrismaDateColumn: true });
    const key = localDate.yearMonth().toString();
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const rawAmount =
      typeof transaction.amount === 'object' && 'toFixed' in transaction.amount
        ? transaction.amount.toFixed(2)
        : String(transaction.amount);
    const money = Money.fromInput(rawAmount);

    if (transaction.type === 'receita') {
      bucket.receitasCents += money.cents;
    } else if (transaction.type === 'despesa') {
      bucket.despesasCents += money.cents;
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    mes: bucket.mes,
    receitas: Money.centsToNumber(bucket.receitasCents),
    despesas: Money.centsToNumber(bucket.despesasCents),
    resultado: Money.centsToNumber(bucket.receitasCents - bucket.despesasCents),
  }));
}

export async function getSummary(
  userId: string | undefined,
  filters: DashboardFilters = {},
  clock: Clock = defaultClock
) {
  assertAuthenticated(userId);

  const currentYm = clock.currentYearMonth(DEFAULT_TIMEZONE);
  const { start, end } = resolvePeriod(filters, clock, DEFAULT_TIMEZONE);
  const wherePeriod = buildWhere(userId, { start, end, categoryId: filters.categoryId });

  let months = Number(filters.months) || EVOLUTION_MONTHS_DEFAULT;
  months = Math.min(Math.max(Math.trunc(months), 1), 12);

  const year = currentYm.year;
  const yearStart = new LocalDate(year, 1, 1).toUtcDate();
  const nextYearStart = new LocalDate(year + 1, 1, 1).toUtcDate();
  const seriesStart = currentYm.addMonths(-(months - 1)).startOfMonth().toUtcDate();
  const seriesEnd = currentYm.endOfMonth().toUtcEndOfDay();

  const [
    periodRevenue,
    periodExpenses,
    totalRevenue,
    totalExpenses,
    yearRevenue,
    categoryGroups,
    seriesTransactions,
    latestTransactions,
    user,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...wherePeriod, type: 'receita' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...wherePeriod, type: 'despesa' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'receita' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'despesa' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        type: 'receita',
        transactionDate: { gte: yearStart, lt: nextYearStart },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['categoryId', 'type'],
      where: wherePeriod,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where: { userId, transactionDate: { gte: seriesStart, lte: seriesEnd } },
      select: { type: true, amount: true, transactionDate: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } }),
  ]);

  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }

  const isMei = user.accountType === 'mei';

  const categoryIds = [...new Set(categoryGroups.map((group) => group.categoryId))];
  const categories = categoryIds.length
    ? await prisma.category.findMany({
        where: { userId, id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));

  const periodInMoney = aggregateToMoney(periodRevenue);
  const periodOutMoney = aggregateToMoney(periodExpenses);
  const totalInMoney = aggregateToMoney(totalRevenue);
  const totalOutMoney = aggregateToMoney(totalExpenses);
  const yearRevMoney = aggregateToMoney(yearRevenue);

  return {
    conta: { accountType: user.accountType },
    saldoAtual: Money.centsToNumber(totalInMoney.signedDiff(totalOutMoney)),
    periodo: {
      inicio: start,
      fim: end,
      totalEntradas: periodInMoney.toNumber(),
      totalDespesas: periodOutMoney.toNumber(),
      resultado: Money.centsToNumber(periodInMoney.signedDiff(periodOutMoney)),
    },
    porCategoria: buildCategoryBreakdown(categoryGroups, categoriesById),
    evolucaoMensal: buildMonthlySeries(seriesTransactions, months, currentYm),
    limiteMei: isMei ? buildMeiLimit(yearRevMoney, year) : null,
    ultimasTransacoes: latestTransactions,
  };
}

export { ATTENTION_THRESHOLD, MEI_TOLERANCE };
