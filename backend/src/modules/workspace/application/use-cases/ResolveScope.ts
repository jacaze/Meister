import prisma from '../../../../config/prisma.js';
import {
  type WorkspaceRole,
  type WorkspaceScope,
  assertAuthenticated,
} from '../../../../shared/index.js';
import { provisionWorkspace } from './ProvisionWorkspace.js';

export async function resolveScopeForUser(
  userId: string | undefined | null,
  requestedWorkspaceId?: string | null
): Promise<WorkspaceScope> {
  assertAuthenticated(userId);
  const actorId: string = userId;

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId: actorId,
      ...(requestedWorkspaceId ? { workspaceId: requestedWorkspaceId } : {}),
    },
    include: {
      workspace: {
        include: {
          entities: {
            where: { active: true },
          },
        },
      },
    },
  });

  if (!member) {
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

  const entities = member.workspace.entities;
  let pf = entities.find((e: { kind: string }) => e.kind === 'pf');
  const pj = entities.find((e: { kind: string }) => e.kind === 'pj');

  // Guard against missing default entities
  if (!pf) {
    pf = await prisma.entity.create({
      data: {
        workspaceId: member.workspaceId,
        kind: 'pf',
        name: 'Pessoal',
        active: true,
      },
    });
  }

  return {
    workspaceId: member.workspaceId,
    actorUserId: userId,
    role: member.role as WorkspaceRole,
    defaultEntityIds: {
      pf: pf.id,
      ...(pj ? { pj: pj.id } : {}),
    },
  };
}
