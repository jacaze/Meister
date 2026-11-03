import type { FastifyInstance } from 'fastify';
import * as userController from '../controllers/userController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/me', userController.me);
  fastify.patch('/me', userController.updateMe);
}

export default userRoutes;
