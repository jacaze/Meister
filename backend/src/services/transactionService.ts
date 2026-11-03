import type { PaymentMethod, Prisma, TransactionType } from '@prisma/client';
import prisma from '../config/prisma.js';
import {
  LocalDate,
  Money,
  NotFoundError,
  ValidationError,
  assertAuthenticated,
  normalizePageQuery,
  type WorkspaceScope,
} from '../shared/index.js';
import { resolveScopeForUser } from '../modules/workspace/public.js';

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

async function findOwnCategory(scope: WorkspaceScope, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: scope.workspaceId },
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
  limit?: string | number;
  entityId?: string;
}

function buildWhere(scope: WorkspaceScope, query: TransactionQuery = {}): Prisma.TransactionWhereInput {
  const { startDate, endDate, categoryId, type, paymentMethod, search, entityId } = query;
  const where: Prisma.TransactionWhereInput = {
    workspaceId: scope.workspaceId,
    deletedAt: null,
  };

  if (entityId) where.entityId = entityId;
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
    throw new ValidationError('A data inicial não pode ser posterior à data final');
  }

  if (start || end) {
    where.transactionDate = {};
    if (start) where.transactionDate.gte = start.toUtcDate();
    if (end) where.transactionDate.lte = end.toUtcEndOfDay();
  }

  return where;
}

export async function create(
  userId: string | undefined,
  input: {
    description?: unknown;
    amount?: unknown;
    type?: unknown;
    categoryId?: unknown;
    paymentMethod?: unknown;
    transactionDate?: unknown;
    entityId?: unknown;
    viaPersonalAccount?: unknown;
  } = {},
  scope?: WorkspaceScope
) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const description = parseDescription(input.description);
  const money = parseAmountToMoney(input.amount);
  const type = parseType(input.type);
  const paymentMethod = parsePaymentMethod(input.paymentMethod);
  const transactionDate = LocalDate.fromInput(input.transactionDate, {
    label: 'Data da transação',
  });

  if (typeof input.categoryId !== 'string' || !input.categoryId) {
    throw new ValidationError('Informe a categoria');
  }

  const category = await findOwnCategory(resolvedScope, input.categoryId);
  assertCategoryType(category, type);

  const targetEntityId: string =
    typeof input.entityId === 'string' && input.entityId
      ? input.entityId
      : type === 'receita' && resolvedScope.defaultEntityIds.pj
        ? resolvedScope.defaultEntityIds.pj
        : resolvedScope.defaultEntityIds.pf;

  return prisma.transaction.create({
    data: {
      userId,
      workspaceId: resolvedScope.workspaceId,
      entityId: targetEntityId,
      categoryId: category.id,
      description,
      amount: money.toNumber(),
      type,
      paymentMethod,
      transactionDate: transactionDate.toUtcDate(),
      viaPersonalAccount: Boolean(input.viaPersonalAccount),
      status: 'confirmado',
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function list(
  userId: string | undefined,
  query: TransactionQuery = {},
  scope?: WorkspaceScope
) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const where = buildWhere(resolvedScope, query);
  const pagination = normalizePageQuery({
    page: query.page,
    pageSize: query.pageSize ?? query.limit,
  });

  const [items, total, summaryRows] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      select: { type: true, amount: true },
    }),
  ]);

  let totalEntradasMoney = Money.zero();
  let totalDespesasMoney = Money.zero();

  for (const row of summaryRows) {
    const raw =
      typeof row.amount === 'object' && 'toFixed' in row.amount
        ? row.amount.toFixed(2)
        : String(row.amount);
    const m = Money.fromDecimalString(raw);
    if (row.type === 'receita') {
      totalEntradasMoney = totalEntradasMoney.add(m);
    } else if (row.type === 'despesa') {
      totalDespesasMoney = totalDespesasMoney.add(m);
    }
  }

  const resultadoCents = totalEntradasMoney.cents - totalDespesasMoney.cents;

  return {
    items,
    paginacao: {
      pagina: pagination.page,
      limite: pagination.pageSize,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    resumo: {
      totalEntradas: totalEntradasMoney.toNumber(),
      totalDespesas: totalDespesasMoney.toNumber(),
      resultado: Money.centsToNumber(resultadoCents),
    },
  };
}

export async function getById(userId: string | undefined, id: string, scope?: WorkspaceScope) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const transaction = await prisma.transaction.findFirst({
    where: { id, workspaceId: resolvedScope.workspaceId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      splits: true,
    },
  });

  if (!transaction) {
    throw new NotFoundError('Transação não encontrada');
  }

  return transaction;
}

export async function update(
  userId: string | undefined,
  id: string,
  input: {
    description?: unknown;
    amount?: unknown;
    type?: unknown;
    categoryId?: unknown;
    paymentMethod?: unknown;
    transactionDate?: unknown;
    viaPersonalAccount?: unknown;
  } = {},
  scope?: WorkspaceScope
) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const transaction = await prisma.transaction.findFirst({
    where: { id, workspaceId: resolvedScope.workspaceId, deletedAt: null },
  });

  if (!transaction) {
    throw new NotFoundError('Transação não encontrada');
  }

  const data: {
    description?: string;
    amount?: number;
    type?: TransactionType;
    categoryId?: string;
    paymentMethod?: PaymentMethod | null;
    transactionDate?: Date;
    viaPersonalAccount?: boolean;
  } = {};

  const targetType = input.type !== undefined ? parseType(input.type) : transaction.type;

  if (input.type !== undefined) {
    data.type = targetType;
  }

  if (input.description !== undefined) {
    data.description = parseDescription(input.description);
  }

  if (input.amount !== undefined) {
    data.amount = parseAmountToMoney(input.amount).toNumber();
  }

  if (input.paymentMethod !== undefined) {
    data.paymentMethod = parsePaymentMethod(input.paymentMethod);
  }

  if (input.transactionDate !== undefined) {
    data.transactionDate = LocalDate.fromInput(input.transactionDate, {
      label: 'Data da transação',
    }).toUtcDate();
  }

  if (input.viaPersonalAccount !== undefined) {
    data.viaPersonalAccount = Boolean(input.viaPersonalAccount);
  }

  if (input.categoryId !== undefined) {
    if (typeof input.categoryId !== 'string' || !input.categoryId) {
      throw new ValidationError('Informe a categoria');
    }
    const category = await findOwnCategory(resolvedScope, input.categoryId);
    assertCategoryType(category, targetType);
    data.categoryId = category.id;
  } else if (input.type !== undefined && input.type !== transaction.type) {
    const currentCategory = await prisma.category.findUnique({
      where: { id: transaction.categoryId ?? undefined },
    });
    if (!currentCategory || currentCategory.type !== targetType) {
      throw new ValidationError(
        'A categoria atual é incompatível com o novo tipo; selecione uma nova categoria'
      );
    }
  }

  return prisma.transaction.update({
    where: { id },
    data,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      splits: true,
    },
  });
}

export async function remove(userId: string | undefined, id: string, scope?: WorkspaceScope) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const transaction = await prisma.transaction.findFirst({
    where: { id, workspaceId: resolvedScope.workspaceId, deletedAt: null },
  });

  if (!transaction) {
    throw new NotFoundError('Transação não encontrada');
  }

  await prisma.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
