import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  createTransfer,
  registerOwnerWithdrawal,
  type CreateTransferInput,
  type RegisterOwnerWithdrawalInput,
} from '../modules/ledger/public.js';

export async function transferRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post<{ Body: CreateTransferInput }>('/transfers', async (request, reply) => {
    const result = await createTransfer(request.scope!, request.body);
    return reply.status(201).send(result);
  });

  fastify.post<{ Body: RegisterOwnerWithdrawalInput }>('/owner-withdrawals', async (request, reply) => {
    const result = await registerOwnerWithdrawal(request.scope!, request.body);
    return reply.status(201).send(result);
  });
}

export default transferRoutes;
