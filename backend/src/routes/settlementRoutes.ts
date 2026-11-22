import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import authMiddleware from '../middlewares/authMiddleware.js';
import { listSettlements, reopenSettlement, settleSettlement } from '../modules/ledger/public.js';

const settleSchema = z.object({ via: z.enum(['transferencia', 'abatimento']) });

// Acertos entre entidades (tarefa 18): quem deve a quem quando o dinheiro de uma pagou o gasto de outra
export async function settlementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get<{ Querystring: { status?: string } }>('/settlements', async (request, reply) => {
    return reply.send(await listSettlements(request.scope!, { status: request.query.status }));
  });

  fastify.post<{ Params: { id: string } }>('/settlements/:id/settle', async (request, reply) => {
    const { via } = settleSchema.parse(request.body);
    return reply.send(await settleSettlement(request.scope!, request.params.id, via));
  });

  fastify.post<{ Params: { id: string } }>('/settlements/:id/reopen', async (request, reply) => {
    return reply.send(await reopenSettlement(request.scope!, request.params.id));
  });
}

export default settlementRoutes;
