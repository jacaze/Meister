import prisma from '../../../../config/prisma.js';
import { assertOwner, NotFoundError, ValidationError, type WorkspaceScope } from '../../../../shared/index.js';
import { syncLegacyAccountType } from './CompleteOnboarding.js';

/** Arquiva um negócio (PJ ou autônomo): some das telas, mas lançamentos e histórico continuam no banco. */
export async function archiveBusiness(scope: WorkspaceScope, entityId: string) {
  assertOwner(scope);

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, workspaceId: scope.workspaceId, active: true },
    select: { id: true, kind: true },
  });
  if (!entity) throw new NotFoundError('Negócio não encontrado.');
  if (entity.kind === 'pf') {
    throw new ValidationError('A conta pessoal (PF) não pode ser arquivada.');
  }

  await prisma.entity.update({ where: { id: entity.id }, data: { active: false } });
  await syncLegacyAccountType(scope);
  return { id: entity.id, active: false };
}
