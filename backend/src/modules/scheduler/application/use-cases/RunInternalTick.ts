import {
  ConflictError,
  DomainError,
  ValidationError,
  type Clock,
  type WorkspaceScope,
} from '../../../../shared/index.js';
import {
  compareConnectionsForSync,
  isConnectionDueForSync,
} from '../../domain/tick-policy.js';
import type {
  BankConnectionTickRecord,
  TickGateway,
  TickLogger,
} from '../ports/TickGateway.js';
import type { TickLock } from '../ports/TickLock.js';
import { systemScopeFor } from '../system-scope.js';

export const DEFAULT_TICK_TIME_BUDGET_MS = 8 * 60 * 1000;

export interface RunInternalTickDeps {
  readonly lock: TickLock;
  readonly gateway: TickGateway;
  readonly clock: Clock;
  readonly timeZone: string;
  readonly syncIntervalHours: number;
  readonly timeBudgetMs?: number;
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
    readonly deferred: number;
  };
  readonly openfinance: {
    readonly synced: number;
    readonly skipped: number;
    readonly errors: number;
    readonly deferred: number;
  };
  /** Presente apenas quando o gateway atualiza insights. */
  readonly insights?: {
    readonly refreshed: number;
    readonly errors: number;
  };
}

interface DueConnectionItem {
  readonly workspaceId: string;
  readonly scope: WorkspaceScope;
  readonly conn: BankConnectionTickRecord;
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
 * enforcing a time budget before the lock transaction timeout and prioritizing connections
 * by null/error status and oldest lastSyncAt first across workspaces.
 */
export async function runInternalTick(deps: RunInternalTickDeps): Promise<RunInternalTickResult> {
  const timeBudgetMs = deps.timeBudgetMs ?? DEFAULT_TICK_TIME_BUDGET_MS;
  if (!Number.isFinite(timeBudgetMs) || timeBudgetMs <= 0) {
    throw new ValidationError('Orçamento de tempo do tick inválido.');
  }

  const lockResult = await deps.lock.withLock(async () => {
    const executedAt = deps.clock.now();
    const startedAtMs = executedAt.getTime();
    const isBudgetExceeded = (): boolean =>
      deps.clock.now().getTime() - startedAtMs >= timeBudgetMs;

    const workspaces = await deps.gateway.listWorkspacesForTick();
    const preparedWorkspaces = workspaces.map((ws) => ({
      ws,
      scope: systemScopeFor(ws.id, ws.entities),
    }));

    let workspacesProcessed = 0;
    let dasCreated = 0;
    let dasAlreadyExisted = 0;
    let dasMarkedOverdue = 0;
    let dasErrors = 0;
    let dasDeferred = 0;
    let ofSynced = 0;
    let ofSkipped = 0;
    let ofErrors = 0;
    let ofDeferred = 0;
    let insightsRefreshed = 0;
    let insightsErrors = 0;

    for (let i = 0; i < preparedWorkspaces.length; i += 1) {
      if (isBudgetExceeded()) {
        dasDeferred = preparedWorkspaces.length - i;
        break;
      }

      const { ws, scope } = preparedWorkspaces[i]!;
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

      if (deps.gateway.refreshWorkspaceInsights && !isBudgetExceeded()) {
        try {
          insightsRefreshed += await deps.gateway.refreshWorkspaceInsights(scope, deps.clock);
        } catch (err) {
          insightsErrors += 1;
          deps.logger?.error(
            { workspaceId: ws.id, errorCode: extractSafeErrorCode(err) },
            'Falha ao atualizar insights no tick interno'
          );
        }
      }

      workspacesProcessed += 1;
    }

    const dueConnections: DueConnectionItem[] = [];
    for (const { ws, scope } of preparedWorkspaces) {
      for (const conn of ws.bankConnections) {
        if (!isConnectionDueForSync(conn, executedAt, deps.syncIntervalHours)) {
          ofSkipped += 1;
          continue;
        }
        dueConnections.push({ workspaceId: ws.id, scope, conn });
      }
    }

    dueConnections.sort((a, b) => compareConnectionsForSync(a.conn, b.conn));

    for (let j = 0; j < dueConnections.length; j += 1) {
      if (isBudgetExceeded()) {
        ofDeferred = dueConnections.length - j;
        break;
      }

      const item = dueConnections[j]!;
      try {
        await deps.gateway.syncPluggyConnection(item.scope, item.conn.id);
        ofSynced += 1;
      } catch (err) {
        ofErrors += 1;
        deps.logger?.error(
          {
            workspaceId: item.workspaceId,
            connectionId: item.conn.id,
            errorCode: extractSafeErrorCode(err),
          },
          'Falha ao sincronizar conexão Open Finance no tick interno'
        );
      }
    }

    if (dasDeferred > 0 || ofDeferred > 0) {
      deps.logger?.warn(
        {
          elapsedMs: deps.clock.now().getTime() - startedAtMs,
          timeBudgetMs,
          dasDeferred,
          openfinanceDeferred: ofDeferred,
        },
        'Orçamento de tempo do tick interno atingido; itens restantes adiados'
      );
    }

    const summary: RunInternalTickResult = {
      executedAt: executedAt.toISOString(),
      workspacesProcessed,
      das: {
        created: dasCreated,
        alreadyExisted: dasAlreadyExisted,
        markedOverdue: dasMarkedOverdue,
        errors: dasErrors,
        deferred: dasDeferred,
      },
      openfinance: {
        synced: ofSynced,
        skipped: ofSkipped,
        errors: ofErrors,
        deferred: ofDeferred,
      },
      ...(deps.gateway.refreshWorkspaceInsights
        ? { insights: { refreshed: insightsRefreshed, errors: insightsErrors } }
        : {}),
    };

    deps.logger?.info(summary as unknown as Record<string, unknown>, 'Rotina interna tick concluída');
    return summary;
  });

  if (!lockResult.acquired) {
    throw new ConflictError('TICK_ALREADY_RUNNING', 'Rotina interna já está em execução.');
  }

  return lockResult.value;
}
