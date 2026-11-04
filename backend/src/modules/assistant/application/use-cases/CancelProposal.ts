import prisma from '../../../../config/prisma.js';
import { assertCanWrite, NotFoundError, ValidationError, type WorkspaceScope } from '../../../../shared/index.js';

export async function cancelProposal(scope: WorkspaceScope, proposalId: string): Promise<{ proposalId: string; status: 'cancelada' }> {
  assertCanWrite(scope);

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, workspaceId: scope.workspaceId },
  });

  if (!proposal) {
    throw new NotFoundError('Proposta não encontrada.');
  }

  if (proposal.status === 'confirmada') {
    throw new ValidationError('Esta proposta já foi confirmada e convertida em lançamento.');
  }

  await prisma.proposal.update({
    where: { id: proposal.id },
    data: { status: 'cancelada' },
  });

  return { proposalId: proposal.id, status: 'cancelada' };
}
