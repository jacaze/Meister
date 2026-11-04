import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  importStatement,
  listReviewInbox,
  approveImportedTransaction,
  ignoreImportedTransaction,
  getPluggyConfig,
  savePluggyConfig,
  createConnectToken,
  connectPluggyItem,
  syncPluggyConnection,
  listBankConnections,
  deleteBankConnection,
} from '../modules/openfinance/public.js';
import { ValidationError } from '../shared/index.js';

export async function openFinanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // 1. Get Pluggy Open Finance Configuration Status
  fastify.get('/openfinance/config', async (_request, reply) => {
    const config = getPluggyConfig();
    return reply.status(200).send(config);
  });

  // 2. Save and Validate Pluggy Credentials
  fastify.post<{
    Body: {
      clientId?: string;
      clientSecret?: string;
    };
  }>('/openfinance/config', async (request, reply) => {
    const body = request.body || {};
    const result = await savePluggyConfig({
      clientId: body.clientId || '',
      clientSecret: body.clientSecret || '',
    });
    return reply.status(200).send({
      ...result,
      message: result.hasCredentials
        ? 'Credenciais do Pluggy validadas e ativadas com sucesso!'
        : 'Credenciais do Pluggy removidas.',
    });
  });

  // 3. Create Connect Token for Widget
  fastify.post('/openfinance/connect-token', async (request, reply) => {
    const scope = request.scope!;
    const tokenResult = await createConnectToken(scope);
    return reply.status(200).send(tokenResult);
  });

  // 4. Connect Item after widget authentication
  fastify.post<{
    Body: {
      itemId?: string;
      entityId?: string;
    };
  }>('/openfinance/connect-item', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body || {};

    if (!body.itemId || typeof body.itemId !== 'string') {
      throw new ValidationError('O itemId retornado pelo Pluggy Connect é obrigatório.');
    }

    const result = await connectPluggyItem(scope, {
      itemId: body.itemId,
      entityId: body.entityId,
    });

    return reply.status(201).send(result);
  });

  // 5. List Connected Banks
  fastify.get('/openfinance/connections', async (request, reply) => {
    const scope = request.scope!;
    const connections = await listBankConnections(scope);
    return reply.status(200).send({ connections });
  });

  // 6. Sync Connection
  fastify.post<{
    Params: {
      id: string;
    };
  }>('/openfinance/connections/:id/sync', async (request, reply) => {
    const scope = request.scope!;
    const { id } = request.params;
    const result = await syncPluggyConnection(scope, { connectionId: id });
    return reply.status(200).send(result);
  });

  // 7. Delete/Revoke Connection
  fastify.delete<{
    Params: {
      id: string;
    };
  }>('/openfinance/connections/:id', async (request, reply) => {
    const scope = request.scope!;
    const { id } = request.params;
    const result = await deleteBankConnection(scope, id);
    return reply.status(200).send(result);
  });

  // 8. Submit Statement (OFX or CSV text/file)
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
      throw new ValidationError('O conteúdo do extrato (OFX ou CSV) é obrigatório.');
    }

    const result = await importStatement(scope, {
      content: body.content,
      provider: body.provider,
      institution: body.institution,
      entityId: body.entityId,
    });

    return reply.status(201).send(result);
  });

  // 9. List Review Inbox
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
    return reply.status(200).send({ items });
  });

  // 10. Approve Item
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
      throw new ValidationError('bankTransactionId é obrigatório.');
    }

    const transaction = await approveImportedTransaction(scope, {
      bankTransactionId: body.bankTransactionId,
      categoryId: body.categoryId,
      entityId: body.entityId,
      viaPersonalAccount: body.viaPersonalAccount,
    });

    return reply.status(200).send(transaction);
  });

  // 11. Batch Approve
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

    return reply.status(200).send({ approvedCount: approved.length, transactions: approved });
  });

  // 12. Ignore Item
  fastify.post<{
    Body: {
      bankTransactionId: string;
    };
  }>('/imports/ignore', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body || {};
    if (!body.bankTransactionId) {
      throw new ValidationError('bankTransactionId é obrigatório.');
    }

    const result = await ignoreImportedTransaction(scope, body.bankTransactionId);
    return reply.status(200).send(result);
  });
}

export default openFinanceRoutes;
