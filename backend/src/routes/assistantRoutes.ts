import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  chatAssistant,
  proposeFromText,
  confirmProposal,
  cancelProposal,
} from '../modules/assistant/public.js';
import { parseReceiptPhoto } from '../modules/receipts/public.js';
import { parseReceiptPhotoSchema } from '../modules/receipts/application/schemas/receipt-schemas.js';
import {
  chatAssistantSchema,
  proposeFromTextSchema,
  assistantProposalParamSchema,
} from '../modules/assistant/application/schemas/assistant-schemas.js';

export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Conversational Assistant Chat
  fastify.post('/assistant/chat', async (request, reply) => {
    const scope = request.scope!;
    const body = chatAssistantSchema.parse(request.body);

    const outcome = await chatAssistant(scope, {
      message: body.message,
      history: body.history,
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
    const body = parseReceiptPhotoSchema.parse(request.body);

    const result = await parseReceiptPhoto(scope, {
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      textOrQrUrl: body.textOrQrUrl,
      entityId: body.entityId ?? scope.defaultEntityIds.pj ?? scope.defaultEntityIds.pf,
    });

    return reply.status(200).send(result);
  });

  // Propose from natural language text
  fastify.post('/assistant/proposals', async (request, reply) => {
    const scope = request.scope!;
    const body = proposeFromTextSchema.parse(request.body);

    const outcome = await proposeFromText(scope, { text: body.text });
    return reply.status(200).send(outcome);
  });

  // Confirm proposal
  fastify.post('/assistant/proposals/:id/confirm', async (request, reply) => {
    const scope = request.scope!;
    const { id } = assistantProposalParamSchema.parse(request.params || {});

    const result = await confirmProposal(scope, id);
    return reply.status(200).send(result);
  });

  // Cancel proposal
  fastify.post('/assistant/proposals/:id/cancel', async (request, reply) => {
    const scope = request.scope!;
    const { id } = assistantProposalParamSchema.parse(request.params || {});

    const result = await cancelProposal(scope, id);
    return reply.status(200).send(result);
  });
}
