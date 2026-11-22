import {
  constantTimeEquals,
  sha256Hex,
  ValidationError,
  type LocalDate,
} from '../../../shared/index.js';

export type InternalSecretAuthResult = 'disabled' | 'unauthorized' | 'authorized';

export interface ConnectionSyncCandidate {
  readonly provider: string;
  readonly itemId: string | null;
  readonly status: string;
  readonly lastSyncAt: Date | null;
}

export interface DasOverdueCandidate {
  readonly status: string;
  readonly dueDate: LocalDate;
}

/**
 * Verifies the X-Internal-Secret header in constant time (via fixed-length SHA-256 digests).
 */
export function verifyInternalSecret(
  providedHeader: string | string[] | undefined,
  configuredSecret: string
): InternalSecretAuthResult {
  const expected = configuredSecret.trim();
  if (expected.length === 0) {
    return 'disabled';
  }
  if (typeof providedHeader !== 'string') {
    return 'unauthorized';
  }
  const provided = providedHeader.trim();
  if (provided.length === 0) {
    return 'unauthorized';
  }
  return constantTimeEquals(sha256Hex(provided), sha256Hex(expected))
    ? 'authorized'
    : 'unauthorized';
}

function connectionSyncPriority(
  connection: Pick<ConnectionSyncCandidate, 'status' | 'lastSyncAt'>
): number {
  if (connection.status === 'erro' && connection.lastSyncAt === null) {
    return 0;
  }
  if (connection.lastSyncAt === null) {
    return 1;
  }
  if (connection.status === 'erro') {
    return 2;
  }
  return 3;
}

/**
 * Orders due bank connections across all workspaces so never-synced (null) and failed ('erro')
 * connections run first, followed by oldest lastSyncAt ascending (prevents starvation).
 */
export function compareConnectionsForSync(
  a: Pick<ConnectionSyncCandidate, 'status' | 'lastSyncAt'>,
  b: Pick<ConnectionSyncCandidate, 'status' | 'lastSyncAt'>
): number {
  const prioDiff = connectionSyncPriority(a) - connectionSyncPriority(b);
  if (prioDiff !== 0) {
    return prioDiff;
  }
  if (a.lastSyncAt === null || b.lastSyncAt === null) {
    return 0;
  }
  return a.lastSyncAt.getTime() - b.lastSyncAt.getTime();
}

/**
 * Determines whether a bank connection should be synchronized in the current tick run.
 */
export function isConnectionDueForSync(
  connection: ConnectionSyncCandidate,
  now: Date,
  syncIntervalHours: number
): boolean {
  if (!Number.isFinite(syncIntervalHours) || syncIntervalHours <= 0) {
    throw new ValidationError('Intervalo de sincronização inválido.');
  }
  if (connection.provider !== 'pluggy') {
    return false;
  }
  if (!connection.itemId || connection.itemId.trim().length === 0) {
    return false;
  }
  if (connection.status === 'revogada') {
    return false;
  }
  if (connection.status === 'erro') {
    return true;
  }
  if (connection.lastSyncAt === null) {
    return true;
  }
  const intervalMs = syncIntervalHours * 60 * 60 * 1000;
  return now.getTime() - connection.lastSyncAt.getTime() >= intervalMs;
}

/**
 * Pure domain predicate indicating whether a pending DAS charge has passed its due date.
 */
export function isDasChargeOverdue(charge: DasOverdueCandidate, today: LocalDate): boolean {
  return charge.status === 'pendente' && charge.dueDate.isBefore(today);
}
