import type { TransactionType } from '@prisma/client';
import prisma from '../config/prisma.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  assertAuthenticated,
} from '../shared/index.js';

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

export async function list(userId: string | undefined) {
  assertAuthenticated(userId);
  return prisma.category.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
}

export async function create(
  userId: string | undefined,
  input: { name?: unknown; type?: unknown } = {}
) {
  assertAuthenticated(userId);

  if (!input.name || !input.type) {
    throw new ValidationError('Nome e tipo da categoria são obrigatórios');
  }

  const name = parseCategoryName(input.name);
  const type = parseCategoryType(input.type);

  return prisma.category.create({
    data: { name, type, userId },
  });
}

export async function update(
  userId: string | undefined,
  categoryId: string,
  input: { name?: unknown; type?: unknown } = {}
) {
  assertAuthenticated(userId);

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    throw new NotFoundError('Categoria não encontrada');
  }

  const data: { name?: string; type?: TransactionType } = {};
  if (input.name !== undefined) {
    data.name = parseCategoryName(input.name);
  }
  if (input.type !== undefined) {
    const newType = parseCategoryType(input.type);
    if (newType !== category.type) {
      const txCount = await prisma.transaction.count({
        where: { categoryId: category.id, userId },
      });
      if (txCount > 0) {
        throw new ConflictError(
          'CATEGORY_TYPE_IMMUTABLE',
          'Não é permitido alterar o tipo de uma categoria que já possui lançamentos'
        );
      }
    }
    data.type = newType;
  }

  return prisma.category.update({
    where: { id: categoryId },
    data,
  });
}

export async function remove(userId: string | undefined, categoryId: string) {
  assertAuthenticated(userId);

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    throw new NotFoundError('Categoria não encontrada');
  }

  const txCount = await prisma.transaction.count({
    where: { categoryId: category.id, userId },
  });

  if (txCount > 0) {
    throw new ConflictError(
      'CATEGORY_IN_USE',
      'Não é possível excluir uma categoria que possui lançamentos vinculados',
      { transactionCount: txCount }
    );
  }

  await prisma.category.delete({ where: { id: categoryId } });
}
