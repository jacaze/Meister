import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, RateLimitedError } from './errors.js';
import { newId } from './ids.js';

export function registerCorrelationAndErrorHandler(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-correlation-id'];
    const correlationId =
      typeof incoming === 'string' && incoming.trim().length > 0 && incoming.length <= 128
        ? incoming.trim()
        : newId();
    request.correlationId = correlationId;
    reply.header('X-Correlation-ID', correlationId);
  });

  fastify.setErrorHandler(
    (error: FastifyError | DomainError | ZodError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = request.correlationId ?? newId();

      if (error instanceof DomainError) {
        if (error instanceof RateLimitedError) {
          reply.header('Retry-After', String(error.retryAfterSeconds));
        }
        return reply.status(error.statusCode).send({
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          correlationId,
        });
      }

      if (error instanceof ZodError) {
        const issues = error.issues;
        const firstMessage = issues[0]?.message || 'Dados inválidos.';
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: firstMessage,
          details: {
            errors: issues.map((issue) => ({
              path: issue.path.join('.'),
              code: issue.code,
            })),
          },
          correlationId,
        });
      }

      const legacyStatus = (error as { statusCode?: number }).statusCode;
      if (typeof legacyStatus === 'number' && legacyStatus >= 400 && legacyStatus < 500) {
        return reply.status(legacyStatus).send({
          code: 'REQUEST_ERROR',
          message: error.message,
          correlationId,
        });
      }

      request.log.error({ err: error, correlationId }, 'Unhandled error in request');
      return reply.status(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Erro interno no servidor.',
        correlationId,
      });
    }
  );
}
