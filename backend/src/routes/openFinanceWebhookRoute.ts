import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  NotFoundError,
  SystemClock,
  UnauthorizedError,
  ValidationError,
  type Clock,
} from '../shared/index.js';
import {
  PLUGGY_WEBHOOK_ACTOR_ID,
  systemScopeFor,
  verifyInternalSecret,
} from '../modules/scheduler/public.js';
import {
  handlePluggyWebhook,
  InMemoryPluggyWebhookDispatcher,
  pluggyWebhookPayloadSchema,
  PrismaPluggyWebhookGateway,
  verifyPluggyWebhookAuth,
  type BankingAggregator,
  type PluggyWebhookDispatcher,
} from '../modules/openfinance/public.js';

export interface OpenFinanceWebhookRouteOptions {
  readonly pluggyWebhookSecret: string;
  readonly clock?: Clock;
  readonly bankingAggregator?: BankingAggregator;
  readonly pluggyWebhookDispatcher?: PluggyWebhookDispatcher;
}

interface ParsedWebhookBodyRecord {
  readonly rawBody: string;
  readonly parsed?: unknown;
  readonly parseError?: boolean;
}

/**
 * Registers POST /openfinance/webhook outside authMiddleware, guarded by
 * PLUGGY_WEBHOOK_SECRET (X-Pluggy-Signature HMAC-SHA256 or constant-time header secret).
 */
export async function openFinanceWebhookRoute(
  fastify: FastifyInstance,
  options: OpenFinanceWebhookRouteOptions
) {
  const clock = options.clock ?? new SystemClock();
  const dispatcher = options.pluggyWebhookDispatcher ?? new InMemoryPluggyWebhookDispatcher();
  const gateway = new PrismaPluggyWebhookGateway({
    buildSystemScope: (workspaceId, entities) =>
      systemScopeFor(workspaceId, entities, PLUGGY_WEBHOOK_ACTOR_ID),
    aggregator: options.bankingAggregator,
  });

  const rawBodyStorage = new WeakMap<FastifyRequest, ParsedWebhookBodyRecord>();

  // Escopado apenas a este plugin: preserva rawBody exato para HMAC sem rejeitar JSON antes do check de assinatura
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      const rawBody = typeof body === 'string' ? body : body.toString('utf8');
      if (rawBody.trim().length === 0) {
        rawBodyStorage.set(request, { rawBody, parseError: true });
        done(null, undefined);
        return;
      }

      try {
        const parsed: unknown = JSON.parse(rawBody);
        rawBodyStorage.set(request, { rawBody, parsed });
        done(null, parsed);
      } catch {
        rawBodyStorage.set(request, { rawBody, parseError: true });
        done(null, undefined);
      }
    }
  );

  fastify.addHook('onClose', async () => {
    await dispatcher.drain();
  });

  fastify.post('/openfinance/webhook', { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const stored = rawBodyStorage.get(request);
    const rawBody = stored?.rawBody ?? '';

    const authResult = verifyPluggyWebhookAuth({
      headers: {
        signature: request.headers['x-pluggy-signature'],
        webhookSecret: request.headers['x-webhook-secret'],
        pluggyWebhookSecret: request.headers['x-pluggy-webhook-secret'],
        authorization: request.headers.authorization,
      },
      rawBody,
      configuredSecret: options.pluggyWebhookSecret,
      nowMs: clock.now().getTime(),
      verifyStaticSecret: verifyInternalSecret,
    });

    if (authResult === 'disabled') {
      throw new NotFoundError('Webhook da Pluggy desabilitado.', 'PLUGGY_WEBHOOK_DISABLED');
    }

    if (authResult === 'unauthorized') {
      throw new UnauthorizedError(
        'Assinatura ou segredo de webhook inválido.',
        'INVALID_PLUGGY_WEBHOOK_SECRET'
      );
    }

    if (stored?.parseError) {
      throw new ValidationError('Payload JSON inválido no webhook da Pluggy.');
    }

    const payloadCandidate = stored ? stored.parsed : request.body;
    const payload = pluggyWebhookPayloadSchema.parse(payloadCandidate);

    const dispatchKey = payload.itemId ?? '__global__';
    dispatcher.enqueue(dispatchKey, async () => {
      try {
        await handlePluggyWebhook(payload, { gateway });
      } catch (err) {
        const errorName =
          err instanceof Error && err.name.trim().length > 0 ? err.name : 'UnknownError';
        request.log.error(
          {
            event: payload.event,
            eventId: payload.eventId ?? null,
            errorName,
          },
          'Falha assíncrona ao processar webhook da Pluggy'
        );
      }
    });

    return reply.status(202).send({ received: true });
  });
}

export default openFinanceWebhookRoute;
