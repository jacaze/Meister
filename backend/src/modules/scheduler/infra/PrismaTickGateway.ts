import prisma from '../../../config/prisma.js';
import type { Clock, WorkspaceScope } from '../../../shared/index.js';
import { syncWorkspaceDas } from '../../fiscal/public.js';
import { syncPluggyConnection, type BankingAggregator } from '../../openfinance/public.js';
import type {
  TickGateway,
  WorkspaceDasTickSummary,
  WorkspaceTickRecord,
} from '../application/ports/TickGateway.js';

export class PrismaTickGateway implements TickGateway {
  public constructor(private readonly aggregator?: BankingAggregator) {}

  public async listWorkspacesForTick(): Promise<ReadonlyArray<WorkspaceTickRecord>> {
    return prisma.workspace.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        entities: {
          select: { id: true, kind: true, isMei: true, active: true },
          orderBy: { createdAt: 'asc' },
        },
        bankConnections: {
          where: { provider: 'pluggy' },
          select: { id: true, provider: true, itemId: true, status: true, lastSyncAt: true },
          orderBy: [{ lastSyncAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
        },
      },
    });
  }

  public async syncWorkspaceDas(
    scope: WorkspaceScope,
    clock: Clock,
    timeZone: string
  ): Promise<WorkspaceDasTickSummary> {
    return syncWorkspaceDas(scope, { clock, timeZone });
  }

  public async syncPluggyConnection(scope: WorkspaceScope, connectionId: string): Promise<void> {
    await syncPluggyConnection(scope, {
      connectionId,
      aggregator: this.aggregator,
    });
  }
}
