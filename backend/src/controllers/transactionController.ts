import type { FastifyReply, FastifyRequest } from 'fastify';
import * as transactionService from '../services/transactionService.js';

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query = (request.query ?? {}) as transactionService.TransactionQuery;
  const result = await transactionService.list(request.userId, query);
  return reply.send(result);
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as transactionService.CreateTransactionInput;
  const transaction = await transactionService.create(request.userId, body);
  return reply.status(201).send(transaction);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const body = (request.body ?? {}) as transactionService.CreateTransactionInput;
  const transaction = await transactionService.update(request.userId, request.params.id, body);
  return reply.send(transaction);
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  await transactionService.remove(request.userId, request.params.id);
  return reply.status(204).send();
}
