import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  chatAssistant,
  proposeFromText,
  confirmProposal,
  cancelProposal,
} from '../modules/assistant/public.js';
import { parseReceiptPhoto } from '../modules/receipts/public.js';
import { ValidationError } from '../shared/index.js';


export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Conversational Assistant Chat
  fastify.post('/assistant/chat', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body as {
      message?: unknown;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      throw new ValidationError('Mensagem é obrigatória.');
    }

    const outcome = await chatAssistant(scope, {
      message: body.message,
      history: Array.isArray(body.history) ? body.history : undefined,
    });

    return reply.status(200).send(outcome);
  });

  // Get Gemini / Assistant Configuration Status
  fastify.get('/assistant/config', async (_request, reply) => {
    const rawKey = process.env.GEMINI_API_KEY;
    const hasApiKey = Boolean(rawKey && rawKey.trim().length > 0);

    return reply.status(200).send({
      hasApiKey,
      model: process.env.LLM_MODEL || 'gemini-3.5-flash',
    });
  });


  // Scan Receipt Photo in Assistant
  fastify.post('/assistant/receipt', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body as {
      imageBase64?: unknown;
      mimeType?: unknown;
      textOrQrUrl?: unknown;
    };

    if (
      (!body.imageBase64 || typeof body.imageBase64 !== 'string') &&
      (!body.textOrQrUrl || typeof body.textOrQrUrl !== 'string')
    ) {
      throw new ValidationError('Imagem base64 ou URL do QR Code é obrigatória.');
    }

    const result = await parseReceiptPhoto(scope, {
      imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      textOrQrUrl: typeof body.textOrQrUrl === 'string' ? body.textOrQrUrl : undefined,
      entityId: scope.defaultEntityIds.pj || scope.defaultEntityIds.pf,
    });

    return reply.status(200).send(result);
  });

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
