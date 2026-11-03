import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getMeiLimit,
  listDas,
  markDasPaid,
  unmarkDasPaid,
} from '../modules/fiscal/public.js';

export async function fiscalRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/mei/limit', async (request, reply) => {
    const query = request.query as { entityId?: string; year?: string };
    const limit = await getMeiLimit(request.scope!, {
      entityId: query.entityId,
      year: query.year ? Number(query.year) : undefined,
    });
    return reply.send(limit);
  });

  fastify.get('/das', async (request, reply) => {
    const query = request.query as { entityId?: string; year?: string };
    const result = await listDas(request.scope!, {
      entityId: query.entityId,
      year: query.year ? Number(query.year) : undefined,
    });
    return reply.send(result);
  });

  fastify.post<{ Params: { id: string }; Body: { paidOn: string; paidAmount?: string } }>(
    '/das/:id/pay',
    async (request, reply) => {
      const updated = await markDasPaid(request.scope!, {
        dasId: request.params.id,
        paidOn: request.body?.paidOn,
        paidAmount: request.body?.paidAmount,
      });
      return reply.send(updated);
    }
  );

  fastify.delete<{ Params: { id: string } }>('/das/:id/pay', async (request, reply) => {
    const updated = await unmarkDasPaid(request.scope!, request.params.id);
    return reply.send(updated);
  });
}

export default fiscalRoutes;
