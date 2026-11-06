import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  JAR_TEMPLATES,
  createJarPlan,
  getJarsStatus,
  mapCategories,
  batchMapCategories,
  updateJarPlanBaseMode,
  type CreateJarPlanInput,
  type MapCategoriesInput,
  type BatchMapCategoriesInput,
} from '../modules/jars/public.js';
import {
  createJarPlanSchema,
  mapCategoriesSchema,
  batchMapCategoriesSchema,
} from '../modules/jars/application/schemas/jars-schemas.js';

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
    const body = createJarPlanSchema.parse(request.body);
    const plan = await createJarPlan(request.scope!, body as unknown as CreateJarPlanInput);
    return reply.status(201).send(plan);
  });

  fastify.patch<{ Params: { planId: string } }>('/jars/plan/:planId', async (request, reply) => {
    const plan = await updateJarPlanBaseMode(request.scope!, request.params.planId, request.body);
    return reply.send(plan);
  });

  fastify.put<{ Body: MapCategoriesInput }>('/jars/categories', async (request, reply) => {
    const body = mapCategoriesSchema.parse(request.body);
    const result = await mapCategories(request.scope!, body);
    return reply.send(result);
  });

  fastify.put<{ Body: BatchMapCategoriesInput }>('/jars/categories/batch', async (request, reply) => {
    const body = batchMapCategoriesSchema.parse(request.body);
    const result = await batchMapCategories(request.scope!, body);
    return reply.send(result);
  });
}

export default jarsRoutes;
