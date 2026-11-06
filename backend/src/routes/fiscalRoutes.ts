import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getMeiLimit,
  listDas,
  markDasPaid,
  unmarkDasPaid,
} from '../modules/fiscal/public.js';
import { markDasPaidSchema } from '../modules/fiscal/application/schemas/fiscal-schemas.js';

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
      const body = markDasPaidSchema.parse(request.body ?? {});
      const updated = await markDasPaid(request.scope!, {
        dasId: request.params.id,
        paidOn: body.paidOn,
        paidAmount: body.paidAmount ? String(body.paidAmount) : undefined,
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
