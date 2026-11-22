import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface ListReviewInboxInput {
  readonly status?: string;
  readonly limit?: number;
}

export async function listReviewInbox(
  scope: WorkspaceScope,
  input: ListReviewInboxInput = {}
) {
  const status = input.status || 'nova';

  const items = await prisma.bankTransaction.findMany({
    where: {
      connection: { workspaceId: scope.workspaceId },
      status,
    },
    orderBy: { occurredOn: 'desc' },
    take: input.limit ?? 100,
    include: { bankAccount: { select: { entityId: true } } },
  });

  return items.map((it) => ({
    id: it.id,
    direction: it.direction as 'in' | 'out',
    amount: String(it.amount),
    occurredOn: it.occurredOn.toISOString().slice(0, 10),
    description: it.description,
    provider: it.provider,
    status: it.status,
    suggestedCategoryId: it.suggestedCategoryId,
    isTransferSuspect: it.isTransferSuspect,
    matchedTransactionId: it.matchedTransactionId,
    // Entidade da conta de origem (tarefa 18): aprovar em outra entidade gera acerto
    accountEntityId: it.bankAccount?.entityId ?? null,
  }));
}
