import type { TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  ConflictError,
  ValidationError,
  assertCanWrite,
  slugify,
  type WorkspaceScope,
} from '../../../../shared/index.js';

const VALID_TYPES: readonly TransactionType[] = ['receita', 'despesa'] as const;

export interface CreateCategoryInput {
  readonly name?: unknown;
  readonly type?: unknown;
}

export function parseCategoryName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new ValidationError('Nome e tipo da categoria são obrigatórios');
  }
  if (name.length > 60) {
    throw new ValidationError('O nome da categoria pode ter no máximo 60 caracteres');
  }
  return name;
}

export function parseCategoryType(value: unknown): TransactionType {
  if (typeof value !== 'string' || !(VALID_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError('Tipo de categoria inválido. Use "receita" ou "despesa"');
  }
  return value as TransactionType;
}

export async function createCategory(
  scope: WorkspaceScope,
  input: CreateCategoryInput
) {
  assertCanWrite(scope);

  const name = parseCategoryName(input.name);
  const type = parseCategoryType(input.type);
  const slug = slugify(name);

  const existing = await prisma.category.findUnique({
    where: {
      workspaceId_type_slug: {
        workspaceId: scope.workspaceId,
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
      workspaceId: scope.workspaceId,
      userId: scope.actorUserId,
      name,
      type,
      slug,
      isDefault: false,
    },
  });
}
