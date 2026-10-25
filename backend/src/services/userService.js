const prisma = require('../config/prisma');

const ACCOUNT_TYPES = ['mei', 'pessoa_fisica'];

const PUBLIC_FIELDS = { id: true, name: true, email: true, accountType: true };

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Devolve só campos públicos: nunca o passwordHash nem os dados de bloqueio de login
async function getProfile(userId) {
  if (!userId) {
    throw httpError('Não autenticado', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_FIELDS,
  });

  if (!user) {
    throw httpError('Usuário não encontrado', 404);
  }

  return user;
}

async function update(userId, data = {}) {
  if (!userId) {
    throw httpError('Não autenticado', 401);
  }

  const { accountType } = data;

  if (accountType === undefined) {
    throw httpError('Informe o tipo de conta', 400);
  }

  if (!ACCOUNT_TYPES.includes(accountType)) {
    throw httpError('Tipo de conta inválido. Use "mei" ou "pessoa_fisica"', 400);
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!existing) {
    throw httpError('Usuário não encontrado', 404);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { accountType },
    select: PUBLIC_FIELDS,
  });
}

module.exports = { ACCOUNT_TYPES, getProfile, update };
