import type { AccountType } from '@prisma/client';
import prisma from '../config/prisma.js';
import { NotFoundError, ValidationError, assertAuthenticated } from '../shared/index.js';

export const ACCOUNT_TYPES: readonly AccountType[] = ['mei', 'pessoa_fisica'] as const;

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  accountType: true,
} as const;

export function isValidAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
}

export async function getProfile(userId: string | undefined) {
  assertAuthenticated(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_FIELDS,
  });

  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }

  return user;
}

export async function update(
  userId: string | undefined,
  data: { accountType?: unknown; name?: unknown } = {}
) {
  assertAuthenticated(userId);

  const { accountType, name } = data;

  if (accountType === undefined && name === undefined) {
    throw new ValidationError('Informe o tipo de conta');
  }

  const updateData: { accountType?: AccountType; name?: string } = {};

  if (accountType !== undefined) {
    if (!isValidAccountType(accountType)) {
      throw new ValidationError('Tipo de conta inválido. Use "mei" ou "pessoa_fisica"');
    }
    updateData.accountType = accountType;
  }

  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length > 120) {
      throw new ValidationError('Nome inválido');
    }
    updateData.name = trimmedName;
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError('Usuário não encontrado');
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: PUBLIC_FIELDS,
  });
}
