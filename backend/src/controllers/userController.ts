import type { FastifyReply, FastifyRequest } from 'fastify';
import * as userService from '../services/userService.js';

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const user = await userService.getProfile(request.userId);
  return reply.send(user);
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as { accountType?: unknown; name?: unknown };
  const user = await userService.update(request.userId, body);
  return reply.send(user);
}
