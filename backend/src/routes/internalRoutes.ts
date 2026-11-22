import type { FastifyInstance } from 'fastify';
import {
  NotFoundError,
  SystemClock,
  UnauthorizedError,
  type Clock,
} from '../shared/index.js';
import type { BankingAggregator } from '../modules/openfinance/public.js';
import {
  PostgresAdvisoryTickLock,
  PrismaTickGateway,
  runInternalTick,
  verifyInternalSecret,
  type TickLock,
} from '../modules/scheduler/public.js';

export interface InternalRoutesOptions {
  readonly internalTickSecret: string;
  readonly timeZone: string;
  readonly openFinanceSyncIntervalHours: number;
  readonly clock?: Clock;
  readonly bankingAggregator?: BankingAggregator;
  readonly tickLock?: TickLock;
}

/**
 * Registers internal scheduled routes outside user authMiddleware, guarded solely by
 * X-Internal-Secret verified in constant time against INTERNAL_TICK_SECRET.
 */
export async function internalRoutes(
  fastify: FastifyInstance,
  options: InternalRoutesOptions
) {
  const lock = options.tickLock ?? new PostgresAdvisoryTickLock();
  const gateway = new PrismaTickGateway(options.bankingAggregator);
  const clock = options.clock ?? new SystemClock();

  fastify.post('/internal/tick', async (request, reply) => {
    const authStatus = verifyInternalSecret(
      request.headers['x-internal-secret'],
      options.internalTickSecret
    );

    if (authStatus === 'disabled') {
      throw new NotFoundError('Rotina interna desabilitada.', 'INTERNAL_TICK_DISABLED');
    }

    if (authStatus === 'unauthorized') {
      throw new UnauthorizedError('Segredo interno inválido.', 'INVALID_INTERNAL_SECRET');
    }

    const result = await runInternalTick({
      lock,
      gateway,
      clock,
      timeZone: options.timeZone,
      syncIntervalHours: options.openFinanceSyncIntervalHours,
      logger: request.log,
    });

    return reply.status(200).send(result);
  });
}

export default internalRoutes;
