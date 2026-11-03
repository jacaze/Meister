import type { TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  ConflictError,
  NotFoundError,
  assertCanWrite,
  slugify,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { parseCategoryName, parseCategoryType } from './CreateCategory.js';

export interface UpdateCategoryInput {
  readonly name?: unknown;
  readonly type?: unknown;
}

export async function updateCategory(
  scope: WorkspaceScope,
  categoryId: string,
  input: UpdateCategoryInput
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

  const data: { name?: string; type?: TransactionType; slug?: string } = {};

  if (input.name !== undefined) {
    const newName = parseCategoryName(input.name);
    const newSlug = slugify(newName);

    const existingConflict = await prisma.category.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        type: (input.type ? parseCategoryType(input.type) : category.type),
        slug: newSlug,
        id: { not: category.id },
      },
    });

    if (existingConflict) {
      throw new ConflictError(
        'CATEGORY_ALREADY_EXISTS',
        `Já existe uma categoria com o nome "${newName}"`
      );
    }

    data.name = newName;
    data.slug = newSlug;
  }

  if (input.type !== undefined) {
    const newType = parseCategoryType(input.type);
    if (newType !== category.type) {
      const txCount = await prisma.transaction.count({
        where: { categoryId: category.id, workspaceId: scope.workspaceId, deletedAt: null },
      });
      const splitCount = await prisma.transactionSplit.count({
        where: { categoryId: category.id },
      });

      if (txCount > 0 || splitCount > 0) {
        throw new ConflictError(
          'CATEGORY_TYPE_IMMUTABLE',
          'Não é permitido alterar o tipo de uma categoria que já possui lançamentos'
        );
      }
      data.type = newType;
    }
  }

  return prisma.category.update({
    where: { id: categoryId },
    data,
  });
}
