const prisma = require('../config/prisma');

const TRANSACTION_TYPES = ['receita', 'despesa'];
const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_AMOUNT = 9999999999.99; // limite do Decimal(12, 2)

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// O Prisma ignora filtros com valor `undefined`. Sem esta checagem, um userId ausente
// faria as consultas devolverem (ou alterarem) dados de todos os usuários.
function requireUser(userId) {
  if (!userId) {
    throw httpError('Não autenticado', 401);
  }
}

function parseDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw httpError(`${label} inválida`, 400);
  }
  return date;
}

function parsePositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseType(value) {
  if (!TRANSACTION_TYPES.includes(value)) {
    throw httpError('Tipo inválido. Use "receita" ou "despesa"', 400);
  }
  return value;
}

function parsePaymentMethod(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null; // limpa a forma de pagamento
  if (!PAYMENT_METHODS.includes(value)) {
    throw httpError(`Forma de pagamento inválida. Use: ${PAYMENT_METHODS.join(', ')}`, 400);
  }
  return value;
}

function parseDescription(value) {
  const description = typeof value === 'string' ? value.trim() : '';
  if (!description) {
    throw httpError('Informe a descrição do lançamento', 400);
  }
  if (description.length > 255) {
    throw httpError('A descrição pode ter no máximo 255 caracteres', 400);
  }
  return description;
}

function parseAmount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw httpError('Valor inválido', 400);
  }

  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError('O valor deve ser maior que zero', 400);
  }
  if (amount > MAX_AMOUNT) {
    throw httpError('Valor acima do limite permitido', 400);
  }
  return amount;
}

async function findOwnCategory(userId, categoryId) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    throw httpError('Categoria inválida', 400);
  }
  return category;
}

function assertCategoryType(category, type) {
  if (category.type !== type) {
    throw httpError('A categoria escolhida é de outro tipo (receita/despesa)', 400);
  }
}

function buildWhere(userId, query = {}) {
  const { startDate, endDate, categoryId, type, paymentMethod, search } = query;
  const where = { userId };

  if (categoryId) where.categoryId = categoryId;
  if (type) where.type = parseType(type);
  if (paymentMethod) where.paymentMethod = parsePaymentMethod(paymentMethod);

  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    where.description = { contains: term, mode: 'insensitive' };
  }

  const start = startDate ? parseDate(startDate, 'Data inicial') : null;
  const end = endDate ? parseDate(endDate, 'Data final') : null;

  if (start && end && start > end) {
    throw httpError('A data inicial não pode ser maior que a data final', 400);
  }

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

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Filtros aceitos: startDate, endDate, categoryId, type, paymentMethod, search (descrição),
// page e pageSize. Retorna a página pedida e o resumo de TODOS os lançamentos filtrados.
async function list(userId, query = {}) {
  requireUser(userId);

  const where = buildWhere(userId, query);
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  // Se o filtro de tipo já restringe a um lado, o outro lado do resumo é zero
  const includeRevenue = !where.type || where.type === 'receita';
  const includeExpense = !where.type || where.type === 'despesa';
  const emptySum = { _sum: { amount: 0 } };

  const [items, total, revenue, expense] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
    includeRevenue
      ? prisma.transaction.aggregate({ where: { ...where, type: 'receita' }, _sum: { amount: true } })
      : emptySum,
    includeExpense
      ? prisma.transaction.aggregate({ where: { ...where, type: 'despesa' }, _sum: { amount: true } })
      : emptySum,
  ]);

  const totalEntradas = sumOf(revenue);
  const totalDespesas = sumOf(expense);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    resumo: {
      totalEntradas: round2(totalEntradas),
      totalDespesas: round2(totalDespesas),
      resultado: round2(totalEntradas - totalDespesas),
    },
  };
}

async function create(userId, data = {}) {
  requireUser(userId);

  const { categoryId, type, description, amount, paymentMethod, transactionDate } = data;

  const missingAmount = amount === undefined || amount === null || amount === '';
  if (!categoryId || !type || !description || missingAmount || !transactionDate) {
    throw httpError('Categoria, tipo, descrição, valor e data são obrigatórios', 400);
  }

  const parsed = {
    type: parseType(type),
    description: parseDescription(description),
    amount: parseAmount(amount),
    transactionDate: parseDate(transactionDate, 'Data'),
    paymentMethod: parsePaymentMethod(paymentMethod),
  };

  const category = await findOwnCategory(userId, categoryId);
  assertCategoryType(category, parsed.type);

  return prisma.transaction.create({
    data: { userId, categoryId, ...parsed },
    include: { category: true },
  });
}

// Atualização parcial: só os campos enviados são alterados.
// Para limpar a forma de pagamento, envie paymentMethod: null.
async function update(userId, transactionId, data = {}) {
  requireUser(userId);

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    throw httpError('Lançamento não encontrado', 404);
  }

  const changes = {};

  if (data.type !== undefined) changes.type = parseType(data.type);
  if (data.description !== undefined) changes.description = parseDescription(data.description);
  if (data.amount !== undefined) changes.amount = parseAmount(data.amount);
  if (data.transactionDate !== undefined) changes.transactionDate = parseDate(data.transactionDate, 'Data');
  if (data.paymentMethod !== undefined) changes.paymentMethod = parsePaymentMethod(data.paymentMethod);

  if (data.categoryId !== undefined) {
    if (!data.categoryId) {
      throw httpError('Categoria inválida', 400);
    }
    changes.categoryId = data.categoryId;
  }

  // A categoria precisa ser do usuário e do mesmo tipo do lançamento
  if (changes.type !== undefined || changes.categoryId !== undefined) {
    const finalType = changes.type ?? transaction.type;
    const finalCategoryId = changes.categoryId ?? transaction.categoryId;
    const category = await findOwnCategory(userId, finalCategoryId);
    assertCategoryType(category, finalType);
  }

  if (Object.keys(changes).length === 0) {
    throw httpError('Nenhum campo para atualizar', 400);
  }

  return prisma.transaction.update({
    where: { id: transactionId },
    data: changes,
    include: { category: true },
  });
}

async function remove(userId, transactionId) {
  requireUser(userId);

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    throw httpError('Lançamento não encontrado', 404);
  }

  await prisma.transaction.delete({ where: { id: transactionId } });
}

module.exports = { list, create, update, remove };
