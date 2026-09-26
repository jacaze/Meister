const prisma = require('../config/prisma');

async function list(userId, filters = {}) {
  const { startDate, endDate, categoryId, type } = filters;

  const where = { userId };

  if (categoryId) where.categoryId = categoryId;
  if (type) where.type = type;

  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate.gte = new Date(startDate);
    if (endDate) where.transactionDate.lte = new Date(endDate);
  }

  return prisma.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { transactionDate: 'desc' },
  });
}

async function create(userId, data) {
  const { categoryId, type, description, amount, paymentMethod, transactionDate } = data;

  if (!categoryId || !type || !description || !amount || !transactionDate) {
    const error = new Error('Categoria, tipo, descrição, valor e data são obrigatórios');
    error.statusCode = 400;
    throw error;
  }

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    const error = new Error('Categoria inválida');
    error.statusCode = 400;
    throw error;
  }

  return prisma.transaction.create({
    data: {
      userId,
      categoryId,
      type,
      description,
      amount,
      paymentMethod,
      transactionDate: new Date(transactionDate),
    },
  });
}

async function update(userId, transactionId, data) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    const error = new Error('Lançamento não encontrado');
    error.statusCode = 404;
    throw error;
  }

  const { categoryId, type, description, amount, paymentMethod, transactionDate } = data;

  return prisma.transaction.update({
    where: { id: transactionId },
    data: {
      categoryId,
      type,
      description,
      amount,
      paymentMethod,
      transactionDate: transactionDate ? new Date(transactionDate) : undefined,
    },
  });
}

async function remove(userId, transactionId) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    const error = new Error('Lançamento não encontrado');
    error.statusCode = 404;
    throw error;
  }

  await prisma.transaction.delete({ where: { id: transactionId } });
}

module.exports = { list, create, update, remove };