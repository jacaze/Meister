import prisma from '../../../config/prisma.js';
import { NotFoundError, type WorkspaceScope } from '../../../shared/index.js';

/**
 * Valida um `entityId` opcional contra o WorkspaceScope: entidade de outro workspace, inexistente
 * ou fora das visíveis ao usuário responde como "não encontrada" (anti-IDOR, 404).
 */
export async function resolveScopedEntityId(
  scope: WorkspaceScope,
  entityId: string | undefined
): Promise<string | undefined> {
  if (!entityId) return undefined;
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, workspaceId: scope.workspaceId },
    select: { id: true },
  });
  if (!entity || !scope.visibleEntityIds.includes(entity.id)) {
    throw new NotFoundError('Entidade não encontrada');
  }
  return entity.id;
}
