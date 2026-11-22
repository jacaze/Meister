import prisma from '../../../../config/prisma.js';
import {
  type WorkspaceRole,
  type WorkspaceScope,
  assertAuthenticated,
  computeEntityAccess,
  NotFoundError,
  pickDefaultEntities,
} from '../../../../shared/index.js';
import { provisionWorkspace } from './ProvisionWorkspace.js';

const memberInclude = {
  workspace: {
    include: {
      entities: {
        where: { active: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
};

/**
 * @param requestedWorkspaceId pedido explícito (cabeçalho x-workspace-id): 404 se a pessoa não participa.
 * @param preferredWorkspaceId preferência (wid do token): usada se a pessoa participa e o workspace não está
 *   arquivado; senão vale o padrão. Quem entra numa família fica com o antigo arquivado (docs/familia.md §4).
 */
export async function resolveScopeForUser(
  userId: string | undefined | null,
  requestedWorkspaceId?: string | null,
  preferredWorkspaceId?: string | null
): Promise<WorkspaceScope> {
  assertAuthenticated(userId);
  const actorId: string = userId;

  const preferred =
    !requestedWorkspaceId && preferredWorkspaceId
      ? await prisma.workspaceMember.findFirst({
          where: { userId: actorId, workspaceId: preferredWorkspaceId, workspace: { archivedAt: null } },
          include: memberInclude,
        })
      : null;

  const member = requestedWorkspaceId
    ? await prisma.workspaceMember.findFirst({
        where: { userId: actorId, workspaceId: requestedWorkspaceId },
        include: memberInclude,
      })
    : preferred ??
      ((await prisma.workspaceMember.findFirst({
        where: { userId: actorId, workspace: { archivedAt: null } },
        include: memberInclude,
        orderBy: { createdAt: 'asc' },
      })) ??
      (await prisma.workspaceMember.findFirst({
        where: { userId: actorId },
        include: memberInclude,
        orderBy: { createdAt: 'asc' },
      })));

  if (!member) {
    if (requestedWorkspaceId) {
      throw new NotFoundError('Workspace não encontrado');
    }
    // Primeiro acesso sem workspace nenhum: provisiona (fluxo antigo de quem nunca teve workspace)
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { accountType: true, name: true },
    });
    const provisionResult = await provisionWorkspace({
      userId: actorId,
      accountType: user?.accountType ?? 'pessoa_fisica',
      workspaceName: user ? `Workspace de ${user.name}` : undefined,
    });
    return provisionResult.scope;
  }

  let entities = member.workspace.entities;
  let defaults = pickDefaultEntities(entities, actorId);

  // Guarda: pessoa sem PF própria nem PF sem dono ganha a sua
  if (!defaults) {
    const pf = await prisma.entity.create({
      data: {
        workspaceId: member.workspaceId,
        kind: 'pf',
        name: 'Pessoal',
        ownerUserId: actorId,
        active: true,
      },
    });
    entities = [...entities, pf];
    defaults = pickDefaultEntities(entities, actorId)!;
  }

  const access = computeEntityAccess(entities, actorId);

  return {
    workspaceId: member.workspaceId,
    actorUserId: actorId,
    role: member.role as WorkspaceRole,
    defaultEntityIds: defaults,
    visibleEntityIds: access.visible,
    ownEntityIds: access.own,
  };
}
