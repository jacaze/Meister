const prisma = require('../config/prisma');

// Teto anual do MEI. Configurável porque há projetos de lei para alterá-lo.
const MEI_ANNUAL_LIMIT = Number(process.env.MEI_ANNUAL_LIMIT) || 81000;
const MEI_TOLERANCE = 0.2; // até 20% acima do teto não gera desenquadramento retroativo
const ATTENTION_THRESHOLD = 0.8; // avisa a partir de 80% do teto
const EVOLUTION_MONTHS_DEFAULT = 6;

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(`${label} inválida`, 400);
  }
  return date;
}

function monthKey(date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

// Sem filtro de datas, o dashboard mostra o mês corrente.
function resolvePeriod(filters, now) {
  const { startDate, endDate } = filters;

  if (!startDate && !endDate) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    return {
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 1) - 1),
    };
  }

  return {
    start: startDate ? parseDate(startDate, 'startDate') : null,
    end: endDate ? parseDate(endDate, 'endDate') : null,
  };
}

function buildWhere(userId, { start, end, categoryId } = {}) {
  const where = { userId };

  if (categoryId) where.categoryId = categoryId;

  if (start || end) {
    where.transactionDate = {};
    if (start) where.transactionDate.gte = start;
    if (end) where.transactionDate.lte = end;
  }

  return where;
}

function sumOf(aggregate) {
  return Number(aggregate._sum.amount || 0);
}

function buildMeiLimit(revenueYear, year) {
  const limit = MEI_ANNUAL_LIMIT;
  const limitWithTolerance = limit * (1 + MEI_TOLERANCE);

  let status = 'ok';
  if (revenueYear > limitWithTolerance) status = 'desenquadramento';
  else if (revenueYear > limit) status = 'excedido';
  else if (revenueYear >= limit * ATTENTION_THRESHOLD) status = 'atencao';

  return {
    ano: year,
    limite: limit,
    limiteComTolerancia: round2(limitWithTolerance),
    faturamentoAno: round2(revenueYear),
    percentualUtilizado: limit > 0 ? round2((revenueYear / limit) * 100) : 0,
    restante: round2(Math.max(limit - revenueYear, 0)),
    status,
  };
}

function buildCategoryBreakdown(groups, categoriesById) {
  const result = { receitas: [], despesas: [] };

  for (const type of ['receita', 'despesa']) {
    const items = groups.filter((group) => group.type === type);
    const total = items.reduce((acc, group) => acc + Number(group._sum.amount || 0), 0);

    const list = items
      .map((group) => {
        const amount = Number(group._sum.amount || 0);
        return {
          categoryId: group.categoryId,
          nome: categoriesById.get(group.categoryId) || 'Sem categoria',
          total: round2(amount),
          quantidade: group._count._all,
          percentual: total > 0 ? round2((amount / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    result[type === 'receita' ? 'receitas' : 'despesas'] = list;
  }

  return result;
}

function buildMonthlySeries(transactions, months, now) {
  const buckets = new Map();

  for (let i = months - 1; i >= 0; i -= 1) {
    const reference = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.set(monthKey(reference), { mes: monthKey(reference), receitas: 0, despesas: 0 });
  }

  for (const transaction of transactions) {
    const bucket = buckets.get(monthKey(new Date(transaction.transactionDate)));
    if (!bucket) continue;

    const amount = Number(transaction.amount || 0);
    if (transaction.type === 'receita') bucket.receitas += amount;
    else if (transaction.type === 'despesa') bucket.despesas += amount;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    mes: bucket.mes,
    receitas: round2(bucket.receitas),
    despesas: round2(bucket.despesas),
    resultado: round2(bucket.receitas - bucket.despesas),
  }));
}

async function getSummary(userId, filters = {}) {
  const now = new Date();
  const { start, end } = resolvePeriod(filters, now);
  const wherePeriod = buildWhere(userId, { start, end, categoryId: filters.categoryId });

  let months = Number(filters.months) || EVOLUTION_MONTHS_DEFAULT;
  months = Math.min(Math.max(Math.trunc(months), 1), 12);

  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));
  const seriesStart = new Date(Date.UTC(year, now.getUTCMonth() - (months - 1), 1));
  const seriesEnd = new Date(Date.UTC(year, now.getUTCMonth() + 1, 1));

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
    // Limite do MEI considera a receita bruta do ano-calendário, sem descontar despesas
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
      where: { userId, transactionDate: { gte: seriesStart, lt: seriesEnd } },
      select: { type: true, amount: true, transactionDate: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { transactionDate: 'desc' },
      take: 5,
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } }),
  ]);

  if (!user) {
    throw httpError('Usuário não encontrado', 404);
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

  const periodIn = sumOf(periodRevenue);
  const periodOut = sumOf(periodExpenses);

  return {
    conta: { accountType: user.accountType },
    saldoAtual: round2(sumOf(totalRevenue) - sumOf(totalExpenses)),
    periodo: {
      inicio: start,
      fim: end,
      totalEntradas: round2(periodIn),
      totalDespesas: round2(periodOut),
      resultado: round2(periodIn - periodOut),
    },
    porCategoria: buildCategoryBreakdown(categoryGroups, categoriesById),
    evolucaoMensal: buildMonthlySeries(seriesTransactions, months, now),
    // O limite anual só faz sentido para quem é MEI; para os demais vai null
    limiteMei: isMei ? buildMeiLimit(sumOf(yearRevenue), year) : null,
    ultimasTransacoes: latestTransactions,
  };
}

module.exports = { getSummary };
