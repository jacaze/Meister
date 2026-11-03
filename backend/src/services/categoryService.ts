import type { TransactionType } from '@prisma/client';
import prisma from '../config/prisma.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  assertAuthenticated,
  slugify,
  type WorkspaceScope,
} from '../shared/index.js';
import { resolveScopeForUser } from '../modules/workspace/public.js';

const CATEGORY_TYPES: readonly TransactionType[] = ['receita', 'despesa'] as const;

function parseCategoryName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new ValidationError('Nome e tipo da categoria são obrigatórios');
  }
  if (name.length > 60) {
    throw new ValidationError('O nome da categoria pode ter no máximo 60 caracteres');
  }
  return name;
}

function parseCategoryType(value: unknown): TransactionType {
  if (typeof value !== 'string' || !(CATEGORY_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError('Tipo de categoria inválido. Use "receita" ou "despesa"');
  }
  return value as TransactionType;
}

export async function list(userId: string | undefined, scope?: WorkspaceScope) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  return prisma.category.findMany({
    where: {
      workspaceId: resolvedScope.workspaceId,
      archivedAt: null,
    },
    orderBy: { name: 'asc' },
  });
}

export async function create(
  userId: string | undefined,
  input: { name?: unknown; type?: unknown } = {},
  scope?: WorkspaceScope
) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  if (!input.name || !input.type) {
    throw new ValidationError('Nome e tipo da categoria são obrigatórios');
  }

  const name = parseCategoryName(input.name);
  const type = parseCategoryType(input.type);
  const slug = slugify(name);

  const existing = await prisma.category.findUnique({
    where: {
      workspaceId_type_slug: {
        workspaceId: resolvedScope.workspaceId,
        type,
        slug,
      },
    },
  });

  if (existing) {
    throw new ConflictError(
      'CATEGORY_ALREADY_EXISTS',
      `Já existe uma categoria de ${type} com o nome "${name}"`
    );
  }

  return prisma.category.create({
    data: {
      name,
      type,
      slug,
      userId,
      workspaceId: resolvedScope.workspaceId,
      isDefault: false,
    },
  });
}

export async function update(
  userId: string | undefined,
  categoryId: string,
  input: { name?: unknown; type?: unknown } = {},
  scope?: WorkspaceScope
) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: resolvedScope.workspaceId },
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
        workspaceId: resolvedScope.workspaceId,
        type: input.type ? parseCategoryType(input.type) : category.type,
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
        where: {
          categoryId: category.id,
          workspaceId: resolvedScope.workspaceId,
          deletedAt: null,
        },
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

export async function remove(userId: string | undefined, categoryId: string, scope?: WorkspaceScope) {
  assertAuthenticated(userId);
  const resolvedScope = scope ?? (await resolveScopeForUser(userId));

  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: resolvedScope.workspaceId },
  });

  if (!category) {
    throw new NotFoundError('Categoria não encontrada');
  }

  const txCount = await prisma.transaction.count({
    where: {
      categoryId: category.id,
      workspaceId: resolvedScope.workspaceId,
      deletedAt: null,
    },
  });

  const splitCount = await prisma.transactionSplit.count({
    where: { categoryId: category.id },
  });

  const totalUsage = txCount + splitCount;
  if (totalUsage > 0) {
    throw new ConflictError(
      'CATEGORY_IN_USE',
      'Não é possível excluir uma categoria que possui lançamentos vinculados',
      { transactionCount: totalUsage }
    );
  }

  await prisma.category.delete({ where: { id: categoryId } });
}
