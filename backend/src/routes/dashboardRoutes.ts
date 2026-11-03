import type { FastifyInstance } from 'fastify';
import * as dashboardController from '../controllers/dashboardController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/dashboard', dashboardController.getSummary);
}

export default dashboardRoutes;
