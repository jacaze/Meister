import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  recordConsent,
  listConsents,
  exportUserData,
  eraseUserAccount,
  listAuditLogs,
  type ConsentKind,
} from '../modules/compliance/public.js';

const recordConsentSchema = z.object({
  kind: z.enum(['terms', 'privacy', 'ai_processing', 'open_finance']),
  version: z.string().optional(),
  accepted: z.boolean(),
});

const eraseAccountSchema = z.object({
  password: z.string().min(1),
});

export async function complianceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // 1. Record Consent
  fastify.post('/consents', async (request, reply) => {
    const scope = request.scope!;
    const parsed = recordConsentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Dados de consentimento inválidos', details: parsed.error.issues });
    }

    const ip = (request.headers['x-forwarded-for'] as string) || request.ip;
    const result = await recordConsent(scope, {
      kind: parsed.data.kind as ConsentKind,
      version: parsed.data.version,
      accepted: parsed.data.accepted,
      ipAddress: ip,
    });

    return reply.status(200).send(result);
  });

  // 2. List Consents
  fastify.get('/consents', async (request, reply) => {
    const scope = request.scope!;
    const consents = await listConsents(scope);
    return reply.status(200).send({ consents });
  });

  // 3. Export User Data (LGPD Data Portability)
  fastify.get('/me/export', async (request, reply) => {
    const scope = request.scope!;
    const data = await exportUserData(scope);
    return reply.status(200).send(data);
  });

  // 4. Erase User Account (Right to Erasure / Revocation)
  fastify.delete('/me', async (request, reply) => {
    const scope = request.scope!;
    const parsed = eraseAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'A confirmação de senha é obrigatória para excluir a conta.' });
    }

    const result = await eraseUserAccount(scope, parsed.data.password);
    return reply.status(200).send(result);
  });

  // 5. List Audit Logs
  fastify.get('/me/audit', async (request, reply) => {
    const scope = request.scope!;
    const limit = (request.query as { limit?: string })?.limit;
    const logs = await listAuditLogs(scope, limit ? parseInt(limit, 10) : 50);
    return reply.status(200).send({ logs });
  });
}

export default complianceRoutes;
