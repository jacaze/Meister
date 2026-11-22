import prisma from '../../../../config/prisma.js';
import {
  assertCanWrite,
  DEFAULT_TIMEZONE,
  SystemClock,
  type Clock,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import { ensureDasChargesWithStats } from './EnsureDasCharges.js';

export interface SyncWorkspaceDasOptions {
  readonly clock?: Clock;
  readonly timeZone?: string;
}

export interface SyncWorkspaceDasResult {
  readonly created: number;
  readonly alreadyExisted: number;
  readonly markedOverdue: number;
}

/**
 * Ensures current-year DAS charges exist for every active MEI entity in the workspace
 * and marks any pending charges whose dueDate is strictly before today (in timeZone) as atrasado.
 */
export async function syncWorkspaceDas(
  scope: WorkspaceScope,
  options: SyncWorkspaceDasOptions = {}
): Promise<SyncWorkspaceDasResult> {
  assertCanWrite(scope);

  const clock = options.clock ?? new SystemClock();
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;

  const meiEntities = await prisma.entity.findMany({
    where: {
      workspaceId: scope.workspaceId,
      active: true,
      isMei: true,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  let alreadyExisted = 0;

  for (const entity of meiEntities) {
    const stats = await ensureDasChargesWithStats(scope, entity.id, { clock, timeZone });
    created += stats.createdCount;
    alreadyExisted += stats.alreadyExistedCount;
  }

  const todayUtc = clock.today(timeZone).toUtcDate();
  const overdueResult = await prisma.dasCharge.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      status: 'pendente',
      dueDate: { lt: todayUtc },
    },
    data: { status: 'atrasado' },
  });

  return {
    created,
    alreadyExisted,
    markedOverdue: overdueResult.count,
  };
}
