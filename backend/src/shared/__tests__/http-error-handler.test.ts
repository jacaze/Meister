import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerCorrelationAndErrorHandler } from '../http-error-handler.js';
import { ValidationError, NotFoundError, RateLimitedError } from '../errors.js';

describe('http-error-handler', () => {
  it('converte ZodError para HTTP 400 com code VALIDATION_ERROR e details sem vazar valores recebidos', async () => {
    const fastify = Fastify({ logger: false });
    const zodWithLocales = z as unknown as {
      config?: (locale: unknown) => void;
      locales?: { pt?: () => unknown };
    };
    if (typeof zodWithLocales.locales?.pt === 'function' && typeof zodWithLocales.config === 'function') {
      zodWithLocales.config(zodWithLocales.locales.pt());
    }
    registerCorrelationAndErrorHandler(fastify);

    const testSchema = z.object({
      nested: z.object({
        email: z.string().email(),
      }),
      amount: z.number().positive(),
    });

    fastify.post('/test-zod', async (req) => {
      const data = testSchema.parse(req.body);
      return { ok: true, data };
    });

    const sensitiveInput = {
      nested: { email: 'not-an-email-value' },
      amount: -9999,
      passwordSecret: 'SuperSecret12345',
    };

    const res = await fastify.inject({
      method: 'POST',
      url: '/test-zod',
      headers: { 'x-correlation-id': 'custom-corr-id-123' },
      payload: sensitiveInput,
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers['x-correlation-id']).toBe('custom-corr-id-123');
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(typeof body.message).toBe('string');
    expect(body.correlationId).toBe('custom-corr-id-123');

    // Valida estrutura de details
    expect(body.details).toBeDefined();
    expect(Array.isArray(body.details.errors)).toBe(true);
    expect(body.details.errors.length).toBeGreaterThanOrEqual(1);

    // Garante que o path aninhado usa '.'
    expect(body.details.errors.some((e: { path: string }) => e.path === 'nested.email')).toBe(true);

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

  it('lida com ZodError sem issues caindo na mensagem padrão de fallback', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-zod-empty', async () => {
      const err = new z.ZodError([]);
      throw err;
    });

    const res = await fastify.inject({ method: 'GET', url: '/test-zod-empty' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toBe('Dados inválidos.');
    expect(body.details.errors).toEqual([]);

    await fastify.close();
  });

  it('usa correlation-id gerado quando não for passado no header', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-gen-corr', async () => {
      throw new ValidationError('Erro com id gerado');
    });

    const res = await fastify.inject({ method: 'GET', url: '/test-gen-corr' });
    expect(res.statusCode).toBe(400);
    const headerCorr = res.headers['x-correlation-id'];
    expect(typeof headerCorr).toBe('string');
    expect((headerCorr as string).length).toBeGreaterThan(10);
    expect(res.json().correlationId).toBe(headerCorr);

    await fastify.close();
  });

  it('lida com RateLimitedError adicionando header Retry-After', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-rate-limit', async () => {
      throw new RateLimitedError('Muitas tentativas', 60);
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/test-rate-limit',
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    const body = res.json();
    expect(body.code).toBe('TOO_MANY_ATTEMPTS');

    await fastify.close();
  });

  it('lida com erros legados HTTP 4xx que não são DomainError (ex: 403 e 404)', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-legacy-403', async () => {
      const err = Object.assign(new Error('Acesso proibido legado'), { statusCode: 403 });
      throw err;
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/test-legacy-403',
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('REQUEST_ERROR');
    expect(body.message).toBe('Acesso proibido legado');

    await fastify.close();
  });

  it('lida com status legado 400 exato e 499 exato', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-400', async () => {
      const err = Object.assign(new Error('Bad request'), { statusCode: 400 });
      throw err;
    });

    fastify.get('/test-499', async () => {
      const err = Object.assign(new Error('Client closed'), { statusCode: 499 });
      throw err;
    });

    const res400 = await fastify.inject({ method: 'GET', url: '/test-400' });
    expect(res400.statusCode).toBe(400);

    const res499 = await fastify.inject({ method: 'GET', url: '/test-499' });
    expect(res499.statusCode).toBe(499);

    await fastify.close();
  });

  it('lida com erros não tratados 500 sem vazar detalhes internos', async () => {
    const fastify = Fastify({ logger: false });
    registerCorrelationAndErrorHandler(fastify);

    fastify.get('/test-500', async () => {
      throw new Error('Falha catastrófica no banco');
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/test-500',
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Erro interno no servidor.');
    expect(JSON.stringify(body)).not.toContain('Falha catastrófica');

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
