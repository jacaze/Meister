import type { Clock, WorkspaceScope } from '../../../../shared/index.js';
import type { WorkspaceEntitySummary } from '../system-scope.js';

export interface BankConnectionTickRecord {
  readonly id: string;
  readonly provider: string;
  readonly itemId: string | null;
  readonly status: string;
  readonly lastSyncAt: Date | null;
}

export interface WorkspaceTickRecord {
  readonly id: string;
  readonly entities: ReadonlyArray<WorkspaceEntitySummary>;
  readonly bankConnections: ReadonlyArray<BankConnectionTickRecord>;
}

export interface WorkspaceDasTickSummary {
  readonly created: number;
  readonly alreadyExisted: number;
  readonly markedOverdue: number;
}

export interface TickLogger {
  info(meta: Record<string, unknown>, message: string): void;
  warn(meta: Record<string, unknown>, message: string): void;
  error(meta: Record<string, unknown>, message: string): void;
}

export interface TickGateway {
  listWorkspacesForTick(): Promise<ReadonlyArray<WorkspaceTickRecord>>;
  syncWorkspaceDas(
    scope: WorkspaceScope,
    clock: Clock,
    timeZone: string
  ): Promise<WorkspaceDasTickSummary>;
  syncPluggyConnection(scope: WorkspaceScope, connectionId: string): Promise<void>;
}
