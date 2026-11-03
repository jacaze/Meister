import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../shared/errors.js';

export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token não informado');
  }

  try {
    const payload = await request.jwtVerify<{
      sub?: string;
      userId?: string;
      id?: string;
      email?: string;
    }>();

    const userId = payload.userId ?? payload.sub ?? payload.id;

    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedError('Token inválido');
    }

    request.userId = userId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

export default authMiddleware;
