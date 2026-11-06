import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  recordConsent,
  listConsents,
  exportUserData,
  eraseUserAccount,
  listAuditLogs,
  type ConsentKind,
} from '../modules/compliance/public.js';
import {
  recordConsentSchema,
  eraseAccountSchema,
} from '../modules/compliance/application/schemas/compliance-schemas.js';

export async function complianceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // 1. Record Consent
  fastify.post('/consents', async (request, reply) => {
    const scope = request.scope!;
    const body = recordConsentSchema.parse(request.body);

    const ip = (request.headers['x-forwarded-for'] as string) || request.ip;
    const result = await recordConsent(scope, {
      kind: body.kind as ConsentKind,
      version: body.version,
      accepted: body.accepted,
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
    const body = eraseAccountSchema.parse(request.body);

    const result = await eraseUserAccount(scope, body.password);
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
