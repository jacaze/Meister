const prisma = require('../config/prisma');

async function list(userId) {
  return prisma.category.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
}

async function create(userId, { name, type }) {
  if (!name || !type) {
    const error = new Error('Nome e tipo da categoria são obrigatórios');
    error.statusCode = 400;
    throw error;
  }

  return prisma.category.create({
    data: { name, type, userId },
  });
}

async function update(userId, categoryId, { name, type }) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    const error = new Error('Categoria não encontrada');
    error.statusCode = 404;
    throw error;
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: { name, type },
  });
}

async function remove(userId, categoryId) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    const error = new Error('Categoria não encontrada');
    error.statusCode = 404;
    throw error;
  }

  await prisma.category.delete({ where: { id: categoryId } });
}

module.exports = { list, create, update, remove };