import prisma from '../../../../config/prisma.js';
import {
  NotFoundError,
  ValidationError,
  assertCanWrite,
  defaultEventBus,
  newId,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { decideNonIncome, type NonIncomeRejection } from '../../domain/NonIncome.js';
import { setNonIncomeSchema } from '../schemas/ledger-schemas.js';

const REJECTION_MESSAGES: Record<NonIncomeRejection, string> = {
  NON_INCOME_ONLY_FOR_INCOME: 'Só entradas (receitas) podem ser marcadas como "não é renda".',
  NON_INCOME_TRANSFER_LEG:
    'Este lançamento faz parte de uma transferência ou pró-labore e já não conta como renda. Gerencie pela rota de transferências.',
};

/**
 * Marca (`reason`) ou desmarca (`reason: null`) uma receita como "não é renda".
 * Marcada, ela vira perna única de transferência: fora da receita do mês, dos potes e do limite MEI.
 * Lançamento de outro workspace (ou apagado) responde 404.
 */
export async function setTransactionNonIncome(scope: WorkspaceScope, id: string, input: unknown) {
  assertCanWrite(scope);
  const { reason } = setNonIncomeSchema.parse(input);

  const tx = await prisma.transaction.findFirst({
    where: { id, workspaceId: scope.workspaceId, deletedAt: null },
  });
  if (!tx) {
    throw new NotFoundError('Transação não encontrada');
  }

  const decision = decideNonIncome(tx, reason);
  if (decision.kind === 'reject') {
    throw new ValidationError(REJECTION_MESSAGES[decision.code], undefined, decision.code);
  }

  const include = { category: { select: { id: true, name: true, slug: true } }, splits: true } as const;
  if (decision.kind === 'noop') {
    return prisma.transaction.findUniqueOrThrow({ where: { id: tx.id }, include });
  }

  const data =
    decision.kind === 'mark'
      ? { transferType: decision.reason, transferGroupId: decision.groupId ?? newId() }
      : { transferType: null, transferGroupId: null };

  const updated = await prisma.$transaction(async (db) => {
    const saved = await db.transaction.update({ where: { id: tx.id }, data, include });
    await db.transactionAudit.create({
      data: {
        workspaceId: scope.workspaceId,
        transactionId: tx.id,
        actor: scope.actorUserId,
        action: 'update',
        before: { transferType: tx.transferType, transferGroupId: tx.transferGroupId },
        after: { transferType: saved.transferType, transferGroupId: saved.transferGroupId },
      },
    });
    return saved;
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
