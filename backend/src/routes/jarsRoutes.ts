import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  JAR_TEMPLATES,
  createJarPlan,
  getJarsStatus,
  mapCategories,
  batchMapCategories,
  type CreateJarPlanInput,
  type MapCategoriesInput,
  type BatchMapCategoriesInput,
} from '../modules/jars/public.js';

export async function jarsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/jars/templates', async (_request, reply) => {
    return reply.send(JAR_TEMPLATES);
  });

  fastify.get('/jars', async (request, reply) => {
    const query = request.query as { entityId?: string; month?: string };
    const status = await getJarsStatus(request.scope!, query);
    return reply.send(status);
  });

  fastify.post<{ Body: CreateJarPlanInput }>('/jars/plan', async (request, reply) => {
    const plan = await createJarPlan(request.scope!, request.body ?? {});
    return reply.status(201).send(plan);
  });

  fastify.put<{ Body: MapCategoriesInput }>('/jars/categories', async (request, reply) => {
    const result = await mapCategories(request.scope!, request.body);
    return reply.send(result);
  });

  fastify.put<{ Body: BatchMapCategoriesInput }>('/jars/categories/batch', async (request, reply) => {
    const result = await batchMapCategories(request.scope!, request.body);
    return reply.send(result);
  });
}

export default jarsRoutes;
