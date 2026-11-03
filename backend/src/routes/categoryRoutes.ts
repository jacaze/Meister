import type { FastifyInstance } from 'fastify';
import * as categoryController from '../controllers/categoryController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

export async function categoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/categories', categoryController.list);
  fastify.post('/categories', categoryController.create);
  fastify.put<{ Params: { id: string } }>('/categories/:id', categoryController.update);
  fastify.delete<{ Params: { id: string } }>('/categories/:id', categoryController.remove);
}

export default categoryRoutes;
