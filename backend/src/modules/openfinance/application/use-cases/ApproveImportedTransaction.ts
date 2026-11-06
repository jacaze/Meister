import prisma from '../../../../config/prisma.js';
import { NotFoundError, ValidationError, type WorkspaceScope } from '../../../../shared/index.js';
import { createTransaction } from '../../../ledger/public.js';

export interface ApproveImportInput {
  readonly bankTransactionId: string;
  readonly categoryId?: string;
  readonly entityId?: string;
  readonly viaPersonalAccount?: boolean;
}

export async function approveImportedTransaction(
  scope: WorkspaceScope,
  input: ApproveImportInput
) {
  const item = await prisma.bankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      connection: { workspaceId: scope.workspaceId },
    },
  });

  if (!item) {
    throw new NotFoundError('Transação importada não encontrada.');
  }

  if (item.status === 'importada') {
    throw new ValidationError('Esta transação já foi aprovada e lançada anteriormente.');
  }

  // Resolve category
  let categoryId = input.categoryId || item.suggestedCategoryId;
  if (!categoryId) {
    const fallbackCategory = await prisma.category.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        type: item.direction === 'in' ? 'receita' : 'despesa',
      },
    });
    categoryId = fallbackCategory?.id ?? null;
  }

  // 1. Create transaction in ledger
  const tx = await createTransaction(scope, {
    type: item.direction === 'in' ? 'receita' : 'despesa',
    amount: String(item.amount),
    description: item.description.slice(0, 1000),
    occurredOn: item.occurredOn.toISOString().slice(0, 10),
    categoryId: categoryId || undefined,
    entityId: input.entityId,
    viaPersonalAccount: input.viaPersonalAccount,
    origin: 'importacao',
    sourceRef: `${item.provider}:${item.externalId}`,
  });

  // 2. Mark bank transaction as imported
  await prisma.bankTransaction.update({
    where: { id: item.id },
    data: {
      status: 'importada',
      importedTransactionId: tx.id,
    },
  });

  return tx;
}

export async function ignoreImportedTransaction(
  scope: WorkspaceScope,
  bankTransactionId: string
) {
  const item = await prisma.bankTransaction.findFirst({
    where: {
      id: bankTransactionId,
      connection: { workspaceId: scope.workspaceId },
    },
  });

  if (!item) {
    throw new NotFoundError('Transação importada não encontrada.');
  }

  return prisma.bankTransaction.update({
    where: { id: item.id },
    data: { status: 'ignorada' },
  });
}
