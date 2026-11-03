import type { PaymentMethod, Prisma, TransactionOrigin, TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  normalizePagination,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface ListTransactionsFilter {
  readonly search?: string;
  readonly type?: TransactionType;
  readonly categoryId?: string;
  readonly paymentMethod?: PaymentMethod;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly entityId?: string;
  readonly status?: string;
  readonly origin?: TransactionOrigin;
  readonly page?: number | string;
  readonly pageSize?: number | string;
  readonly limit?: number | string; // legacy support
}

export async function listTransactions(
  scope: WorkspaceScope,
  filter: ListTransactionsFilter = {}
) {
  const where: Prisma.TransactionWhereInput = {
    workspaceId: scope.workspaceId,
    deletedAt: null,
  };

  if (filter.entityId) {
    where.entityId = filter.entityId;
  }

  if (filter.type) {
    where.type = filter.type;
  }

  if (filter.categoryId) {
    where.categoryId = filter.categoryId;
  }

  if (filter.paymentMethod) {
    where.paymentMethod = filter.paymentMethod;
  }

  if (filter.status) {
    where.status = filter.status;
  }

  if (filter.origin) {
    where.origin = filter.origin;
  }

  if (filter.search) {
    const term = filter.search.trim();
    if (term) {
      where.description = {
        contains: term,
        mode: 'insensitive',
      };
    }
  }

  if (filter.startDate || filter.endDate) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filter.startDate) {
      const d = LocalDate.fromIsoDate(filter.startDate);
      dateFilter.gte = new Date(`${d.toIsoDate()}T00:00:00.000Z`);
    }
    if (filter.endDate) {
      const d = LocalDate.fromIsoDate(filter.endDate);
      dateFilter.lte = new Date(`${d.toIsoDate()}T23:59:59.999Z`);
    }
    where.transactionDate = dateFilter;
  }

  const { page, pageSize } = normalizePagination({
    page: filter.page,
    pageSize: filter.pageSize ?? filter.limit,
  });

  const [items, total, allMatching] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [
        { transactionDate: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        splits: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      select: { amount: true, type: true },
    }),
  ]);

  let totalEntradas = Money.zero();
  let totalDespesas = Money.zero();

  for (const row of allMatching) {
    const amt = Money.fromDecimalString(row.amount.toString());
    if (row.type === 'receita') {
      totalEntradas = totalEntradas.add(amt);
    } else if (row.type === 'despesa') {
      totalDespesas = totalDespesas.add(amt);
    }
  }

  const resultadoCents = totalEntradas.cents - totalDespesas.cents;
  const resultado = Money.fromCents(resultadoCents);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    resumo: {
      totalEntradas: totalEntradas.toDecimalString(),
      totalDespesas: totalDespesas.toDecimalString(),
      resultado: resultado.toDecimalString(),
    },
  };
}
