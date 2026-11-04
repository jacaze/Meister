import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  importStatement,
  listReviewInbox,
  approveImportedTransaction,
  ignoreImportedTransaction,
} from '../modules/openfinance/public.js';

export async function openFinanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // 1. Submit Statement (OFX or CSV text/file)
  fastify.post<{
    Body: {
      content: string;
      provider?: 'ofx' | 'csv' | 'pluggy';
      institution?: string;
      entityId?: string;
    };
  }>('/imports/statement', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body || {};
    if (!body.content || typeof body.content !== 'string') {
      return reply.status(400).send({ message: 'O conteúdo do extrato (OFX ou CSV) é obrigatório.' });
    }

    const result = await importStatement(scope, {
      content: body.content,
      provider: body.provider,
      institution: body.institution,
      entityId: body.entityId,
    });

    return reply.status(201).send(result);
  });

  // 2. List Review Inbox
  fastify.get<{
    Querystring: {
      status?: string;
      limit?: string;
    };
  }>('/imports', async (request, reply) => {
    const scope = request.scope!;
    const items = await listReviewInbox(scope, {
      status: request.query.status,
      limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
    });
    return reply.send({ items });
  });

  // 3. Approve Item
  fastify.post<{
    Body: {
      bankTransactionId: string;
      categoryId?: string;
      entityId?: string;
      viaPersonalAccount?: boolean;
    };
  }>('/imports/approve', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body || {};
    if (!body.bankTransactionId) {
      return reply.status(400).send({ message: 'bankTransactionId é obrigatório.' });
    }

    const transaction = await approveImportedTransaction(scope, {
      bankTransactionId: body.bankTransactionId,
      categoryId: body.categoryId,
      entityId: body.entityId,
      viaPersonalAccount: body.viaPersonalAccount,
    });

    return reply.send(transaction);
  });

  // 4. Batch Approve
  fastify.post<{
    Body: {
      items: Array<{
        bankTransactionId: string;
        categoryId?: string;
        entityId?: string;
      }>;
    };
  }>('/imports/batch-approve', async (request, reply) => {
    const scope = request.scope!;
    const items = request.body?.items || [];
    const approved = [];

    for (const it of items) {
      try {
        const tx = await approveImportedTransaction(scope, it);
        approved.push(tx);
      } catch (err) {
        request.log.warn(err, `[openFinanceRoutes] Failed to approve item ${it.bankTransactionId}`);
      }
    }

    return reply.send({ approvedCount: approved.length, transactions: approved });
  });

  // 5. Ignore Item
  fastify.post<{
    Body: {
      bankTransactionId: string;
    };
  }>('/imports/ignore', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body || {};
    if (!body.bankTransactionId) {
      return reply.status(400).send({ message: 'bankTransactionId é obrigatório.' });
    }

    const result = await ignoreImportedTransaction(scope, body.bankTransactionId);
    return reply.send(result);
  });
}

export default openFinanceRoutes;
