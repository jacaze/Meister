import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  assertCanWrite,
  defaultEventBus,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export async function deleteTransaction(
  scope: WorkspaceScope,
  id: string
) {
  assertCanWrite(scope);

  const tx = await prisma.transaction.findFirst({
    where: { id, workspaceId: scope.workspaceId, deletedAt: null },
  });

  if (!tx) {
    throw new NotFoundError('Transação não encontrada');
  }

  const now = new Date();

  // If part of transfer, soft-delete both legs
  if (tx.transferGroupId) {
    await prisma.transaction.updateMany({
      where: { transferGroupId: tx.transferGroupId, workspaceId: scope.workspaceId },
      data: { deletedAt: now },
    });
  } else {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { deletedAt: now },
    });
  }

  await prisma.transactionAudit.create({
    data: {
      workspaceId: scope.workspaceId,
      transactionId: tx.id,
      actor: scope.actorUserId,
      action: 'delete',
      before: {
        amount: tx.amount.toString(),
        type: tx.type,
        description: tx.description,
      },
    },
  });

  defaultEventBus.publish({
    name: 'transaction.deleted',
    occurredAt: now,
    payload: {
      workspaceId: scope.workspaceId,
      entityId: tx.entityId,
      transactionId: tx.id,
      type: tx.type,
      amount: tx.amount.toString(),
      occurredOn: tx.transactionDate.toISOString().slice(0, 10),
      status: tx.status,
    },
  });
}

