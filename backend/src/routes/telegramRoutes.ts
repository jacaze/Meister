import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  createLinkToken,
  getLinkStatus,
  handleUpdate,
} from '../modules/telegram/public.js';

export async function telegramRoutes(fastify: FastifyInstance): Promise<void> {
  // Public Webhook endpoint called by Telegram Servers
  fastify.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const update = request.body as any;
    if (!update) {
      return reply.status(400).send({ error: 'Corpo vazio' });
    }

    // Process update asynchronously or synchronously
    try {
      await handleUpdate(update);
    } catch (err) {
      request.log.error(err, '[TelegramWebhook] Failed processing update');
    }

    return reply.status(200).send({ ok: true });
  });

  // Authenticated endpoints for UI linking
  fastify.register(async (authedRoutes) => {
    authedRoutes.addHook('preHandler', authMiddleware);

    // POST /telegram/link-token
    authedRoutes.post('/link-token', async (request: FastifyRequest, reply: FastifyReply) => {
      const tokenData = await createLinkToken(request.scope);
      return reply.status(200).send(tokenData);
    });

    // GET /telegram/status
    authedRoutes.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
      const status = await getLinkStatus(request.scope);
      return reply.status(200).send(status);
    });
  });
}
