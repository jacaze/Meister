import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../shared/errors.js';
import { resolveScopeForUser } from '../modules/workspace/public.js';

export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token não informado');
  }

  let userId: string | undefined;
  let tokenWorkspaceId: string | undefined;
  try {
    const payload = await request.jwtVerify<{
      sub?: string;
      userId?: string;
      id?: string;
      email?: string;
      wid?: string;
    }>();
    userId = payload.userId ?? payload.sub ?? payload.id;
    tokenWorkspaceId = payload.wid;
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }

  if (!userId || typeof userId !== 'string') {
    throw new UnauthorizedError('Token inválido');
  }

  request.userId = userId;
  // Cabeçalho = pedido explícito (404 se não participa); wid do token = só preferência
  const headerWorkspaceId = request.headers['x-workspace-id'];
  request.scope = await resolveScopeForUser(
    userId,
    typeof headerWorkspaceId === 'string' && headerWorkspaceId ? headerWorkspaceId : undefined,
    tokenWorkspaceId
  );
}

export default authMiddleware;
