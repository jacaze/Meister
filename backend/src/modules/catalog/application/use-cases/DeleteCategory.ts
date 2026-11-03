import prisma from '../../../../config/prisma.js';
import {
  ConflictError,
  NotFoundError,
  assertCanWrite,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export async function deleteCategory(
  scope: WorkspaceScope,
  categoryId: string
) {
  assertCanWrite(scope);

  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      workspaceId: scope.workspaceId,
    },
  });

  if (!category) {
    throw new NotFoundError('Categoria não encontrada');
  }

  const txCount = await prisma.transaction.count({
    where: {
      categoryId,
      workspaceId: scope.workspaceId,
      deletedAt: null,
    },
  });

  const splitCount = await prisma.transactionSplit.count({
    where: { categoryId },
  });

  const totalUsage = txCount + splitCount;
  if (totalUsage > 0) {
    throw new ConflictError(
      'CATEGORY_IN_USE',
      'Esta categoria não pode ser excluída pois possui lançamentos associados',
      { transactionCount: totalUsage }
    );
  }

  const jarCount = await prisma.jarCategory.count({
    where: { categoryId },
  });

  if (jarCount > 0) {
    throw new ConflictError(
      'CATEGORY_IN_USE',
      'Esta categoria está vinculada a um pote financeiro',
      { jarCount }
    );
  }

  await prisma.category.delete({
    where: { id: categoryId },
  });
}
