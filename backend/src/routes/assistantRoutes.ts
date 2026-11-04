import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  proposeFromText,
  confirmProposal,
  cancelProposal,
} from '../modules/assistant/public.js';
import { ValidationError } from '../shared/index.js';

export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Propose from natural language text
  fastify.post('/assistant/proposals', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body as { text?: unknown };
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      throw new ValidationError('Texto da mensagem é obrigatório.');
    }

    const outcome = await proposeFromText(scope, { text: body.text });
    return reply.status(200).send(outcome);
  });

  // Confirm proposal
  fastify.post('/assistant/proposals/:id/confirm', async (request, reply) => {
    const scope = request.scope!;
    const { id } = request.params as { id: string };

    const result = await confirmProposal(scope, id);
    return reply.status(200).send(result);
  });

  // Cancel proposal
  fastify.post('/assistant/proposals/:id/cancel', async (request, reply) => {
    const scope = request.scope!;
    const { id } = request.params as { id: string };

    const result = await cancelProposal(scope, id);
    return reply.status(200).send(result);
  });
}
