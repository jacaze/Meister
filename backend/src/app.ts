import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import prisma from './config/prisma.js';
import { type AppEnv, parseEnv, registerCorrelationAndErrorHandler } from './shared/index.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import fiscalRoutes from './routes/fiscalRoutes.js';
import jarsRoutes from './routes/jarsRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';
import insightRoutes from './routes/insightRoutes.js';
import openFinanceRoutes from './routes/openFinanceRoutes.js';
import { educationRoutes } from './routes/educationRoutes.js';
import { complianceRoutes } from './routes/complianceRoutes.js';
import { assistantRoutes } from './routes/assistantRoutes.js';
import { telegramRoutes, telegramWebhookRoute } from './routes/telegramRoutes.js';

export interface BuildAppOptions {
  env?: AppEnv;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  // Configuração global de locale do Zod em português (Zod 4)
  const zodWithLocales = z as unknown as {
    config?: (locale: unknown) => void;
    locales?: { pt?: () => unknown };
  };
  if (typeof zodWithLocales.locales?.pt === 'function' && typeof zodWithLocales.config === 'function') {
    zodWithLocales.config(zodWithLocales.locales.pt());
  }

  const env = options.env ?? parseEnv(process.env);
  const fastify = Fastify({
    logger: options.logger ?? env.NODE_ENV !== 'test',
    bodyLimit: 10 * 1024 * 1024, // 10 MB for receipt images
  });

  registerCorrelationAndErrorHandler(fastify);

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    origin: env.CORS_ORIGINS.includes('*') ? true : env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(cookie);

  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  });

  await fastify.register(authRoutes, {
    prefix: '/api',
    lockTimeMinutes: env.LOCK_TIME_MINUTES,
  });
  await fastify.register(categoryRoutes, { prefix: '/api' });
  await fastify.register(transactionRoutes, { prefix: '/api' });
  await fastify.register(dashboardRoutes, { prefix: '/api' });
  await fastify.register(userRoutes, { prefix: '/api' });
  await fastify.register(workspaceRoutes, { prefix: '/api' });
  await fastify.register(fiscalRoutes, { prefix: '/api' });
  await fastify.register(jarsRoutes, { prefix: '/api' });
  await fastify.register(transferRoutes, { prefix: '/api' });
  await fastify.register(receiptRoutes, { prefix: '/api' });
  await fastify.register(insightRoutes, { prefix: '/api' });
  await fastify.register(openFinanceRoutes, { prefix: '/api' });
  await fastify.register(educationRoutes, { prefix: '/api' });
  await fastify.register(complianceRoutes, { prefix: '/api' });
  await fastify.register(assistantRoutes, { prefix: '/api' });
  await fastify.register(telegramRoutes, { prefix: '/api' });
  await fastify.register(telegramWebhookRoute);

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/health/live', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({
        status: 'ready',
        database: 'up',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(503).send({
        status: 'not_ready',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return fastify;
}
