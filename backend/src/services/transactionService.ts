import type { PaymentMethod, Prisma, TransactionType } from '@prisma/client';
import prisma from '../config/prisma.js';
import {
  LocalDate,
  Money,
  NotFoundError,
  ValidationError,
  assertAuthenticated,
  normalizePageQuery,
} from '../shared/index.js';

const TRANSACTION_TYPES: readonly TransactionType[] = ['receita', 'despesa'] as const;
const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'dinheiro',
  'pix',
  'cartao_credito',
  'cartao_debito',
  'boleto',
  'outro',
] as const;

function parseType(value: unknown): TransactionType {
  if (typeof value !== 'string' || !(TRANSACTION_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError('Tipo inválido. Use "receita" ou "despesa"');
  }
  return value as TransactionType;
}

function parsePaymentMethod(value: unknown): PaymentMethod | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(value)) {
    throw new ValidationError(`Forma de pagamento inválida. Use: ${PAYMENT_METHODS.join(', ')}`);
  }
  return value as PaymentMethod;
}

function parseDescription(value: unknown): string {
  const description = typeof value === 'string' ? value.trim() : '';
  if (!description) {
    throw new ValidationError('Informe a descrição do lançamento');
  }
  if (description.length > 255) {
    throw new ValidationError('A descrição pode ter no máximo 255 caracteres');
  }
  return description;
}

function parseAmountToMoney(value: unknown): Money {
  return Money.fromInput(value, { requirePositive: true, allowComma: false });
}

async function findOwnCategory(userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    throw new ValidationError('Categoria inválida');
  }
  return category;
}

function assertCategoryType(category: { type: TransactionType }, type: TransactionType): void {
  if (category.type !== type) {
    throw new ValidationError('A categoria escolhida é de outro tipo (receita/despesa)');
  }
}

export interface TransactionQuery {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  type?: string;
  paymentMethod?: string;
  search?: string;
  page?: string | number;
  pageSize?: string | number;
}

function buildWhere(userId: string, query: TransactionQuery = {}): Prisma.TransactionWhereInput {
  const { startDate, endDate, categoryId, type, paymentMethod, search } = query;
  const where: Prisma.TransactionWhereInput = { userId };

  if (categoryId) where.categoryId = categoryId;
  if (type) where.type = parseType(type);
  if (paymentMethod) {
    const pm = parsePaymentMethod(paymentMethod);
    if (pm) where.paymentMethod = pm;
  }

  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    where.description = { contains: term, mode: 'insensitive' };
  }

  const start = startDate ? LocalDate.fromInput(startDate, { label: 'Data inicial' }) : null;
  const end = endDate ? LocalDate.fromInput(endDate, { label: 'Data final' }) : null;

  if (start && end && start.isAfter(end)) {
    throw new ValidationError('A data inicial não pode ser maior que a data final');
  }

  if (start || end) {
    where.transactionDate = {};
    if (start) where.transactionDate.gte = start.toUtcDate();
    if (end) where.transactionDate.lte = end.toUtcEndOfDay();
  }

  return where;
}

function aggregateToMoney(aggregate: { _sum: { amount: Prisma.Decimal | null } }): Money {
  const raw = aggregate._sum.amount;
  if (!raw) return Money.zero();
  return Money.fromDecimalString(raw.toFixed(2));
}

export async function list(userId: string | undefined, query: TransactionQuery = {}) {
  assertAuthenticated(userId);

  const where = buildWhere(userId, query);
  const { page, pageSize, skip, take } = normalizePageQuery(query);

  const includeRevenue = !where.type || where.type === 'receita';
  const includeExpense = !where.type || where.type === 'despesa';
  const emptySum = { _sum: { amount: null } };

  const [items, total, revenue, expense] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
    prisma.transaction.count({ where }),
    includeRevenue
      ? prisma.transaction.aggregate({
          where: { ...where, type: 'receita' },
          _sum: { amount: true },
        })
      : Promise.resolve(emptySum),
    includeExpense
      ? prisma.transaction.aggregate({
          where: { ...where, type: 'despesa' },
          _sum: { amount: true },
        })
      : Promise.resolve(emptySum),
  ]);

  const entradasMoney = aggregateToMoney(revenue);
  const despesasMoney = aggregateToMoney(expense);
  const resultadoCents = entradasMoney.signedDiff(despesasMoney);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    resumo: {
      totalEntradas: entradasMoney.toNumber(),
      totalDespesas: despesasMoney.toNumber(),
      resultado: Money.centsToNumber(resultadoCents),
    },
  };
}

export interface CreateTransactionInput {
  categoryId?: unknown;
  type?: unknown;
  description?: unknown;
  amount?: unknown;
  paymentMethod?: unknown;
  transactionDate?: unknown;
}

export async function create(userId: string | undefined, data: CreateTransactionInput = {}) {
  assertAuthenticated(userId);

  const { categoryId, type, description, amount, paymentMethod, transactionDate } = data;

  const missingAmount = amount === undefined || amount === null || amount === '';
  if (!categoryId || typeof categoryId !== 'string' || !type || !description || missingAmount || !transactionDate) {
    throw new ValidationError('Categoria, tipo, descrição, valor e data são obrigatórios');
  }

  const parsedType = parseType(type);
  const parsedDescription = parseDescription(description);
  const parsedAmount = parseAmountToMoney(amount);
  const parsedDate = LocalDate.fromInput(transactionDate, { label: 'Data' });
  const parsedPaymentMethod = parsePaymentMethod(paymentMethod);

  const category = await findOwnCategory(userId, categoryId);
  assertCategoryType(category, parsedType);

  return prisma.transaction.create({
    data: {
      userId,
      categoryId,
      type: parsedType,
      description: parsedDescription,
      amount: parsedAmount.toDecimalString(),
      transactionDate: parsedDate.toUtcDate(),
      paymentMethod: parsedPaymentMethod,
    },
    include: { category: true },
  });
}

export async function update(
  userId: string | undefined,
  transactionId: string,
  data: CreateTransactionInput = {}
) {
  assertAuthenticated(userId);

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    throw new NotFoundError('Lançamento não encontrado');
  }

  const changes: Prisma.TransactionUncheckedUpdateInput = {};

  if (data.type !== undefined) changes.type = parseType(data.type);
  if (data.description !== undefined) changes.description = parseDescription(data.description);
  if (data.amount !== undefined) changes.amount = parseAmountToMoney(data.amount).toDecimalString();
  if (data.transactionDate !== undefined) {
    changes.transactionDate = LocalDate.fromInput(data.transactionDate, { label: 'Data' }).toUtcDate();
  }
  if (data.paymentMethod !== undefined) {
    changes.paymentMethod = parsePaymentMethod(data.paymentMethod);
  }

  if (data.categoryId !== undefined) {
    if (!data.categoryId || typeof data.categoryId !== 'string') {
      throw new ValidationError('Categoria inválida');
    }
    changes.categoryId = data.categoryId;
  }

  if (changes.type !== undefined || changes.categoryId !== undefined) {
    const finalType = (changes.type as TransactionType | undefined) ?? transaction.type;
    const finalCategoryId = (changes.categoryId as string | undefined) ?? transaction.categoryId;
    const category = await findOwnCategory(userId, finalCategoryId);
    assertCategoryType(category, finalType);
  }

  if (Object.keys(changes).length === 0) {
    throw new ValidationError('Nenhum campo para atualizar');
  }

  return prisma.transaction.update({
    where: { id: transactionId },
    data: changes,
    include: { category: true },
  });
}

export async function remove(userId: string | undefined, transactionId: string) {
  assertAuthenticated(userId);

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    throw new NotFoundError('Lançamento não encontrado');
  }

  await prisma.transaction.delete({ where: { id: transactionId } });
}
