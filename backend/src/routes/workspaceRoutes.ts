import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  archiveBusiness,
  completeOnboarding,
  getWorkspaceOverview,
  updateBusinessProfile,
  type UpdateBusinessProfileInput,
} from '../modules/workspace/public.js';
import {
  onboardingSchema,
  updateBusinessProfileSchema,
} from '../modules/workspace/application/schemas/workspace-schemas.js';

export async function workspaceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/workspace', async (request, reply) => {
    const overview = await getWorkspaceOverview(request.scope!);
    return reply.send(overview);
  });

  // Perfil do primeiro acesso (tarefa 17); pode ser refeito para adicionar negócios
  fastify.post('/onboarding', async (request, reply) => {
    const body = onboardingSchema.parse(request.body);
    const result = await completeOnboarding(request.scope!, body);
    return reply.send(result);
  });

  fastify.delete<{ Params: { id: string } }>('/workspace/businesses/:id', async (request, reply) => {
    const result = await archiveBusiness(request.scope!, request.params.id);
    return reply.send(result);
  });

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/entities/:id/business-profile',
    async (request, reply) => {
      const body = updateBusinessProfileSchema.parse(request.body);
      const input: UpdateBusinessProfileInput = {
        ...body,
        entityId: request.params.id,
      };
      const updated = await updateBusinessProfile(request.scope!, input);
      return reply.send(updated);
    }
  );
}

export default workspaceRoutes;
