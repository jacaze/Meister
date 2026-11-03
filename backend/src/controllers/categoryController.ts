import type { FastifyReply, FastifyRequest } from 'fastify';
import * as categoryService from '../services/categoryService.js';

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const categories = await categoryService.list(request.userId, request.scope);
  return reply.send(categories);
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as { name?: unknown; type?: unknown };
  const category = await categoryService.create(request.userId, body, request.scope);
  return reply.status(201).send(category);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const body = (request.body ?? {}) as { name?: unknown; type?: unknown };
  const category = await categoryService.update(request.userId, request.params.id, body, request.scope);
  return reply.send(category);
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  await categoryService.remove(request.userId, request.params.id, request.scope);
  return reply.status(204).send();
}
