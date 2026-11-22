import prisma from '../../../config/prisma.js';
import type { TickLock, TickLockResult } from '../application/ports/TickLock.js';

export const INTERNAL_TICK_LOCK_KEY_1 = 1835362675;
export const INTERNAL_TICK_LOCK_KEY_2 = 1953063787;
export const DEFAULT_TICK_LOCK_MAX_WAIT_MS = 5_000;
export const DEFAULT_TICK_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export interface PostgresAdvisoryTickLockOptions {
  readonly maxWaitMs?: number;
  readonly timeoutMs?: number;
}

/**
 * Guards internal tick execution with an in-process flag plus a PostgreSQL transaction-scoped
 * advisory lock (pg_try_advisory_xact_lock) configured with an explicit long transaction timeout.
 */
export class PostgresAdvisoryTickLock implements TickLock {
  private inFlight = false;

  public constructor(private readonly options: PostgresAdvisoryTickLockOptions = {}) {}

  public async withLock<T>(fn: () => Promise<T>): Promise<TickLockResult<T>> {
    if (this.inFlight) {
      return { acquired: false };
    }

    this.inFlight = true;
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
            SELECT pg_try_advisory_xact_lock(
              ${INTERNAL_TICK_LOCK_KEY_1}::int4,
              ${INTERNAL_TICK_LOCK_KEY_2}::int4
            ) AS acquired
          `;
          if (!rows[0]?.acquired) {
            return { acquired: false } as const;
          }

          const value = await fn();
          return { acquired: true, value } as const;
        },
        {
          maxWait: this.options.maxWaitMs ?? DEFAULT_TICK_LOCK_MAX_WAIT_MS,
          timeout: this.options.timeoutMs ?? DEFAULT_TICK_LOCK_TIMEOUT_MS,
        }
      );
    } finally {
      this.inFlight = false;
    }
  }
}
