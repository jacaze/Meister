import type { FastifyInstance } from 'fastify';
import * as transactionController from '../controllers/transactionController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { setTransactionNonIncome } from '../modules/ledger/public.js';

export async function transactionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/transactions', transactionController.list);
  fastify.get<{ Params: { id: string } }>('/transactions/:id', transactionController.getById);
  fastify.post('/transactions', transactionController.create);
  fastify.put<{ Params: { id: string } }>('/transactions/:id', transactionController.update);
  fastify.delete<{ Params: { id: string } }>('/transactions/:id', transactionController.remove);

  // "Não é renda": marca/desmarca uma receita (body validado por setNonIncomeSchema no caso de uso)
  fastify.put<{ Params: { id: string } }>('/transactions/:id/non-income', async (request, reply) => {
    const transaction = await setTransactionNonIncome(request.scope!, request.params.id, request.body ?? {});
    return reply.send(transaction);
  });
}

export default transactionRoutes;
