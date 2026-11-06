import type { FastifyReply, FastifyRequest } from 'fastify';
import * as userService from '../services/userService.js';

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const user = await userService.getProfile(request.userId);
  return reply.send(user);
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const user = await userService.update(
    request.userId,
    request.body as { accountType?: unknown; name?: unknown }
  );
  return reply.send(user);
}
