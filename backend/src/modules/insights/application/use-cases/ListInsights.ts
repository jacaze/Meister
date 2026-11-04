import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface ListInsightsInput {
  readonly entityId?: string;
  readonly status?: string;
  readonly severity?: string;
  readonly limit?: number;
}

export async function listInsights(
  scope: WorkspaceScope,
  input: ListInsightsInput = {}
) {
  const where: Record<string, unknown> = {
    workspaceId: scope.workspaceId,
  };

  if (input.entityId) {
    where.entityId = input.entityId;
  }

  if (input.status) {
    where.status = input.status;
  } else {
    where.status = { not: 'dispensada' };
  }

  if (input.severity) {
    where.severity = input.severity;
  }

  const items = await prisma.insight.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 50,
  });

  // Sort by severity weight (alerta = 3, atencao = 2, info = 1)
  const severityWeight: Record<string, number> = {
    alerta: 3,
    atencao: 2,
    info: 1,
  };

  items.sort((a, b) => {
    const wa = severityWeight[a.severity] ?? 0;
    const wb = severityWeight[b.severity] ?? 0;
    if (wb !== wa) return wb - wa;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return items;
}
