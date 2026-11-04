import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { characterizationRoutes } from './routes/characterizationRoutes.js';
import { fiscalRoutes } from './routes/fiscalRoutes.js';
import { jarsRoutes } from './routes/jarsRoutes.js';
import { ledgerRoutes } from './routes/ledgerRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { assistantRoutes } from './routes/assistantRoutes.js';
import { telegramRoutes } from './routes/telegramRoutes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  // CORS
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  // JWT
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // Swagger docs
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Meister API',
        description: 'Backend para Gestão Financeira MEI',
        version: '0.1.0',
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Feature Routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(ledgerRoutes, { prefix: '/transactions' });
  await app.register(fiscalRoutes, { prefix: '/fiscal' });
  await app.register(jarsRoutes, { prefix: '/jars' });
  await app.register(characterizationRoutes, { prefix: '/profile' });
  await app.register(assistantRoutes, { prefix: '/assistant' });
  await app.register(telegramRoutes, { prefix: '/telegram' });

  // Central Error Handler
  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as any).statusCode || 500;
    const message = error.message || 'Erro interno do servidor';

    if (statusCode >= 500) {
      request.log.error(error);
    }

    return reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message,
    });
  });

  return app;
}
