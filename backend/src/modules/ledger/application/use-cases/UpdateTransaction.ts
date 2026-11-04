import type { PaymentMethod, TransactionType } from '@prisma/client';
import prisma from '../../../../config/prisma.js';
import {
  LocalDate,
  Money,
  NotFoundError,
  ValidationError,
  assertCanWrite,
  defaultEventBus,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface UpdateTransactionInput {
  readonly description?: unknown;
  readonly amount?: unknown;
  readonly type?: unknown;
  readonly categoryId?: unknown;
  readonly paymentMethod?: unknown;
  readonly transactionDate?: unknown;
  readonly viaPersonalAccount?: unknown;
}

export async function updateTransaction(
  scope: WorkspaceScope,
  id: string,
  input: UpdateTransactionInput
) {
  assertCanWrite(scope);

  const tx = await prisma.transaction.findFirst({
    where: { id, workspaceId: scope.workspaceId, deletedAt: null },
    include: { splits: true, category: true },
  });

  if (!tx) {
    throw new NotFoundError('Transação não encontrada');
  }

  const beforeAudit = {
    amount: tx.amount.toString(),
    type: tx.type,
    description: tx.description,
    categoryId: tx.categoryId,
    transactionDate: tx.transactionDate.toISOString().slice(0, 10),
  };

  const data: Record<string, unknown> = {};

  if (input.description !== undefined) {
    const desc = typeof input.description === 'string' ? input.description.trim() : '';
    if (!desc) {
      throw new ValidationError('A descrição não pode ficar em branco');
    }
    data.description = desc;
  }

  if (input.amount !== undefined) {
    const amt = Money.fromDecimalString(String(input.amount).trim());
    if (!amt.isPositive()) {
      throw new ValidationError('O valor deve ser maior que zero');
    }
    if (tx.splits && tx.splits.length > 0) {
      let splitSum = Money.zero();
      for (const split of tx.splits) {
        splitSum = splitSum.add(Money.fromDecimalString(String(split.amount).trim()));
      }
      if (amt.cents !== splitSum.cents) {
        throw new ValidationError(
          `O novo valor (R$ ${amt.toDecimalString()}) diverge da soma das divisões existentes (R$ ${splitSum.toDecimalString()})`
        );
      }
    }
    data.amount = Number(amt.toDecimalString());
  }

  const targetType = input.type !== undefined ? (input.type as TransactionType) : tx.type;
  if (input.type !== undefined) {
    if (input.type !== 'receita' && input.type !== 'despesa') {
      throw new ValidationError('Tipo inválido');
    }
    data.type = input.type;
  }

  if (input.categoryId !== undefined) {
    const catId = typeof input.categoryId === 'string' ? input.categoryId : null;
    if (catId) {
      const cat = await prisma.category.findFirst({
        where: { id: catId, workspaceId: scope.workspaceId },
      });
      if (!cat) {
        throw new ValidationError('Categoria não encontrada');
      }
      if (cat.type !== targetType) {
        throw new ValidationError(`Categoria "${cat.name}" não é do tipo ${targetType}`);
      }
      data.categoryId = cat.id;
    } else {
      data.categoryId = null;
    }
  }

  if (input.paymentMethod !== undefined) {
    data.paymentMethod = input.paymentMethod as PaymentMethod | null;
  }

  if (input.transactionDate !== undefined) {
    try {
      const d = LocalDate.fromIsoDate(String(input.transactionDate));
      data.transactionDate = new Date(`${d.toIsoDate()}T00:00:00.000Z`);
    } catch {
      throw new ValidationError('Data da transação inválida');
    }
  }

  if (input.viaPersonalAccount !== undefined) {
    data.viaPersonalAccount = Boolean(input.viaPersonalAccount);
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      splits: true,
    },
  });

  await prisma.transactionAudit.create({
    data: {
      workspaceId: scope.workspaceId,
      transactionId: tx.id,
      actor: scope.actorUserId,
      action: 'update',
      before: beforeAudit,
      after: {
        amount: updated.amount.toString(),
        type: updated.type,
        description: updated.description,
        categoryId: updated.categoryId,
        transactionDate: updated.transactionDate.toISOString().slice(0, 10),
      },
    },
  });

  defaultEventBus.publish({
    name: 'transaction.updated',
    occurredAt: new Date(),
    payload: {
      workspaceId: scope.workspaceId,
      entityId: updated.entityId,
      transactionId: updated.id,
      type: updated.type,
      amount: updated.amount.toString(),
      occurredOn: updated.transactionDate.toISOString().slice(0, 10),
      status: updated.status,
    },
  });

  return updated;
}
