import prisma from '../../../../config/prisma.js';
import { NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';

export async function getTransaction(
  scope: WorkspaceScope,
  id: string
) {
  const tx = await prisma.transaction.findFirst({
    where: { id, workspaceId: scope.workspaceId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      splits: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!tx) {
    throw new NotFoundError('Transação não encontrada');
  }

  return tx;
}
