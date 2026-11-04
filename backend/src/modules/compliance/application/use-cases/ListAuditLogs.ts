import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface AuditLogDto {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string | null;
  readonly meta: unknown;
  readonly createdAt: string;
}

export async function listAuditLogs(
  scope: WorkspaceScope,
  limit = 50
): Promise<readonly AuditLogDto[]> {
  const records = await prisma.auditLog.findMany({
    where: {
      workspaceId: scope.workspaceId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return records.map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    target: r.target,
    meta: r.meta,
    createdAt: r.createdAt.toISOString(),
  }));
}
