import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  proposeFromText,
  confirmProposal,
  cancelProposal,
} from '../modules/assistant/public.js';

export async function assistantRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // POST /assistant/propose-text
  fastify.post('/propose-text', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { text?: string };
    if (!body?.text || typeof body.text !== 'string') {
      return reply.status(400).send({ error: 'Campo "text" é obrigatório.' });
    }

    const outcome = await proposeFromText(request.scope, {
      text: body.text,
    });

    return reply.status(200).send(outcome);
  });

  // POST /assistant/proposals/:id/confirm
  fastify.post('/proposals/:id/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const result = await confirmProposal(request.scope, params.id);
    return reply.status(200).send(result);
  });

  // POST /assistant/proposals/:id/cancel
  fastify.post('/proposals/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const result = await cancelProposal(request.scope, params.id);
    return reply.status(200).send(result);
  });
}
