import type { FastifyReply, FastifyRequest } from 'fastify';
import * as transactionService from '../services/transactionService.js';
import { assertCanWrite } from '../shared/index.js';

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const result = await transactionService.list(
    request.userId,
    request.query as transactionService.TransactionQuery,
    request.scope
  );
  return reply.send(result);
}

export async function getById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const transaction = await transactionService.getById(
    request.userId,
    request.params.id,
    request.scope
  );
  return reply.send(transaction);
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  if (request.scope) assertCanWrite(request.scope);
  const body = (request.body ?? {}) as Parameters<typeof transactionService.create>[1];
  const transaction = await transactionService.create(request.userId, body, request.scope);
  return reply.status(201).send(transaction);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (request.scope) assertCanWrite(request.scope);
  const body = (request.body ?? {}) as Parameters<typeof transactionService.update>[2];
  const transaction = await transactionService.update(
    request.userId,
    request.params.id,
    body,
    request.scope
  );
  return reply.send(transaction);
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (request.scope) assertCanWrite(request.scope);
  await transactionService.remove(request.userId, request.params.id, request.scope);
  return reply.status(204).send();
}
