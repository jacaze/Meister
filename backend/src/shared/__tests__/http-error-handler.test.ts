import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerCorrelationAndErrorHandler } from '../http-error-handler.js';
import { ValidationError, NotFoundError } from '../errors.js';

describe('http-error-handler', () => {
  it('converte ZodError para HTTP 400 com code VALIDATION_ERROR e details sem vazar valores recebidos', async () => {
    const fastify = Fastify({ logger: false });
    if (typeof (z as any).locales?.pt === 'function') {
      (z as any).config((z as any).locales.pt());
    }
    registerCorrelationAndErrorHandler(fastify);

    const testSchema = z.object({
      email: z.string().email(),
      amount: z.number().positive(),
    });

    fastify.post('/test-zod', async (req) => {
      const data = testSchema.parse(req.body);
      return { ok: true, data };
    });

    const sensitiveInput = {
      email: 'not-an-email-value',
      amount: -9999,
      passwordSecret: 'SuperSecret12345',
    };

    const res = await fastify.inject({
      method: 'POST',
      url: '/test-zod',
      payload: sensitiveInput,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(typeof body.message).toBe('string');
    expect(body.correlationId).toBeDefined();

    // Valida estrutura de details
    expect(body.details).toBeDefined();
    expect(Array.isArray(body.details.errors)).toBe(true);
    expect(body.details.errors.length).toBeGreaterThanOrEqual(1);

    // Garante que APENAS path e code são devolvidos em cada issue, e NUNCA o valor sensível
    for (const err of body.details.errors) {
      expect(err).toHaveProperty('path');
      expect(err).toHaveProperty('code');
      expect(err).not.toHaveProperty('received');
      expect(err).not.toHaveProperty('value');
    }

    const rawResponse = JSON.stringify(body);
    expect(rawResponse).not.toContain('SuperSecret12345');
    expect(rawResponse).not.toContain('not-an-email-value');
    expect(rawResponse).not.toContain('-9999');

    await fastify.close();
  });

  it('mantém ValidationError de domínio inalterado com seu formato e details próprios', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-domain-val', async () => {
      throw new ValidationError('Erro específico de negócio', { customField: 'info' });
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/test-domain-val',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Erro específico de negócio');
    expect(body.details).toEqual({ customField: 'info' });
    expect(body.correlationId).toBeDefined();

    await fastify.close();
  });

  it('mantém outros DomainErrors (como NotFoundError) inalterados', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-not-found', async () => {
      throw new NotFoundError('Recurso inexistente');
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/test-not-found',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Recurso inexistente');
    expect(body.correlationId).toBeDefined();

    await fastify.close();
  });
});
