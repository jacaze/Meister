import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getWorkspaceOverview,
  updateBusinessProfile,
  type UpdateBusinessProfileInput,
} from '../modules/workspace/public.js';
import { updateBusinessProfileSchema } from '../modules/workspace/application/schemas/workspace-schemas.js';

export async function workspaceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/workspace', async (request, reply) => {
    const overview = await getWorkspaceOverview(request.scope!);
    return reply.send(overview);
  });

  fastify.put<{ Params: { id: string }; Body: UpdateBusinessProfileInput }>(
    '/entities/:id/business-profile',
    async (request, reply) => {
      const body = updateBusinessProfileSchema.parse(request.body ?? {});
      const updated = await updateBusinessProfile(request.scope!, {
        ...body,
        entityId: request.params.id,
      });
      return reply.send(updated);
    }
  );
}

export default workspaceRoutes;
