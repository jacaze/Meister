import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  createLinkToken,
  getTelegramLinkStatus,
  unlinkChat,
  handleTelegramUpdate,
  TelegramApiChannel,
  type TelegramUpdate,
} from '../modules/telegram/public.js';
import { UnauthorizedError } from '../shared/index.js';

export async function telegramRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Create link token for the authenticated user
  fastify.post('/telegram/link-token', async (request, reply) => {
    const scope = request.scope!;
    const result = await createLinkToken(scope);
    return reply.status(201).send(result);
  });

  // Get current Telegram link status
  fastify.get('/telegram/status', async (request, reply) => {
    const scope = request.scope!;
    const status = await getTelegramLinkStatus(scope);
    return reply.status(200).send(status);
  });

  // Unlink telegram
  fastify.post('/telegram/unlink', async (request, reply) => {
    const scope = request.scope!;
    const result = await unlinkChat(scope);
    return reply.status(200).send(result);
  });
}

/**
 * Public webhook route called by Telegram Bot servers
 */
export async function telegramWebhookRoute(fastify: FastifyInstance) {
  const channel = new TelegramApiChannel();

  fastify.post('/telegram/webhook', async (request, reply) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== secret) {
        throw new UnauthorizedError('INVALID_WEBHOOK_SECRET', 'Secret token inválido.');
      }
    }

    const update = request.body as TelegramUpdate;
    if (update && typeof update === 'object' && 'update_id' in update) {
      try {
        await handleTelegramUpdate(update, channel);
      } catch (err) {
        request.log.error(err, '[telegramWebhookRoute] Error handling update');
      }
    }

    // Telegram requires an immediate 200 OK
    return reply.status(200).send({ ok: true });
  });
}
