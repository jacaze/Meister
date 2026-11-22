import { ConflictError, DomainError, type Clock } from '../../../../shared/index.js';
import { isConnectionDueForSync } from '../../domain/tick-policy.js';
import type { TickGateway, TickLogger } from '../ports/TickGateway.js';
import type { TickLock } from '../ports/TickLock.js';
import { systemScopeFor } from '../system-scope.js';

export interface RunInternalTickDeps {
  readonly lock: TickLock;
  readonly gateway: TickGateway;
  readonly clock: Clock;
  readonly timeZone: string;
  readonly syncIntervalHours: number;
  readonly logger?: TickLogger;
}

export interface RunInternalTickResult {
  readonly executedAt: string;
  readonly workspacesProcessed: number;
  readonly das: {
    readonly created: number;
    readonly alreadyExisted: number;
    readonly markedOverdue: number;
    readonly errors: number;
  };
  readonly openfinance: {
    readonly synced: number;
    readonly skipped: number;
    readonly errors: number;
  };
}

function extractSafeErrorCode(err: unknown): string {
  if (err instanceof DomainError) {
    return err.code;
  }
  if (err instanceof Error) {
    const trimmed = err.name.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Orchestrates the periodic internal tick across all workspaces under an exclusive lock,
 * isolating DAS and Open Finance failures per workspace/connection without logging sensitive data.
 */
export async function runInternalTick(deps: RunInternalTickDeps): Promise<RunInternalTickResult> {
  const lockResult = await deps.lock.withLock(async () => {
    const executedAt = deps.clock.now();
    const workspaces = await deps.gateway.listWorkspacesForTick();

    let workspacesProcessed = 0;
    let dasCreated = 0;
    let dasAlreadyExisted = 0;
    let dasMarkedOverdue = 0;
    let dasErrors = 0;
    let ofSynced = 0;
    let ofSkipped = 0;
    let ofErrors = 0;

    for (const ws of workspaces) {
      const scope = systemScopeFor(ws.id, ws.entities);

      try {
        const dasSummary = await deps.gateway.syncWorkspaceDas(scope, deps.clock, deps.timeZone);
        dasCreated += dasSummary.created;
        dasAlreadyExisted += dasSummary.alreadyExisted;
        dasMarkedOverdue += dasSummary.markedOverdue;
      } catch (err) {
        dasErrors += 1;
        deps.logger?.error(
          { workspaceId: ws.id, errorCode: extractSafeErrorCode(err) },
          'Falha ao sincronizar DAS no tick interno'
        );
      }

      for (const conn of ws.bankConnections) {
        if (!isConnectionDueForSync(conn, executedAt, deps.syncIntervalHours)) {
          ofSkipped += 1;
          continue;
        }

        try {
          await deps.gateway.syncPluggyConnection(scope, conn.id);
          ofSynced += 1;
        } catch (err) {
          ofErrors += 1;
          deps.logger?.error(
            {
              workspaceId: ws.id,
              connectionId: conn.id,
              errorCode: extractSafeErrorCode(err),
            },
            'Falha ao sincronizar conexão Open Finance no tick interno'
          );
        }
      }

      workspacesProcessed += 1;
    }

    const summary: RunInternalTickResult = {
      executedAt: executedAt.toISOString(),
      workspacesProcessed,
      das: {
        created: dasCreated,
        alreadyExisted: dasAlreadyExisted,
        markedOverdue: dasMarkedOverdue,
        errors: dasErrors,
      },
      openfinance: {
        synced: ofSynced,
        skipped: ofSkipped,
        errors: ofErrors,
      },
    };

    deps.logger?.info(summary as unknown as Record<string, unknown>, 'Rotina interna tick concluída');
    return summary;
  });

  if (!lockResult.acquired) {
    throw new ConflictError('TICK_ALREADY_RUNNING', 'Rotina interna já está em execução.');
  }

  return lockResult.value;
}
