import prisma from '../../../../config/prisma.js';
import { NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';

export async function getWorkspaceOverview(scope: WorkspaceScope) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: scope.workspaceId },
    include: {
      entities: {
        where: { active: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace não encontrado');
  }

  const entities = workspace.entities.map((e) => {
    const isProfileComplete = Boolean(e.cnpj && e.openedOn && e.activity);
    return {
      id: e.id,
      kind: e.kind,
      name: e.name,
      cnpj: e.cnpj,
      legalName: e.legalName,
      openedOn: e.openedOn ? e.openedOn.toISOString().slice(0, 10) : null,
      activity: e.activity,
      isMei: e.isMei,
      profileComplete: isProfileComplete,
    };
  });

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      plan: workspace.plan,
      createdAt: workspace.createdAt.toISOString(),
    },
    role: scope.role,
    entities,
    defaultEntityIds: scope.defaultEntityIds,
  };
}
