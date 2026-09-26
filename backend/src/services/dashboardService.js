const prisma = require('../config/prisma');

function buildWhere(userId, filters = {}) {
  const { startDate, endDate, categoryId } = filters;
  const where = { userId };

  if (categoryId) where.categoryId = categoryId;

  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate.gte = new Date(startDate);
    if (endDate) where.transactionDate.lte = new Date(endDate);
  }

  return where;
}

async function getSummary(userId, filters = {}) {
  const whereFiltrado = buildWhere(userId, filters);

  const [totalReceitasPeriodo, totalDespesasPeriodo] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...whereFiltrado, type: 'receita' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...whereFiltrado, type: 'despesa' },
      _sum: { amount: true },
    }),
  ]);

  const [totalReceitasGeral, totalDespesasGeral] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: 'receita' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'despesa' },
      _sum: { amount: true },
    }),
  ]);

  const entradasPeriodo = Number(totalReceitasPeriodo._sum.amount || 0);
  const despesasPeriodo = Number(totalDespesasPeriodo._sum.amount || 0);

  const entradasGeral = Number(totalReceitasGeral._sum.amount || 0);
  const despesasGeral = Number(totalDespesasGeral._sum.amount || 0);

  return {
    saldoAtual: entradasGeral - despesasGeral,
    periodo: {
      totalEntradas: entradasPeriodo,
      totalDespesas: despesasPeriodo,
      resultado: entradasPeriodo - despesasPeriodo,
    },
  };
}

module.exports = { getSummary };