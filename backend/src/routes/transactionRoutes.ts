import type { FastifyInstance } from 'fastify';
import * as transactionController from '../controllers/transactionController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

export async function transactionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/transactions', transactionController.list);
  fastify.post('/transactions', transactionController.create);
  fastify.put<{ Params: { id: string } }>('/transactions/:id', transactionController.update);
  fastify.delete<{ Params: { id: string } }>('/transactions/:id', transactionController.remove);
}

export default transactionRoutes;
