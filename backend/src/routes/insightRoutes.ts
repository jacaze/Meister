import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  runDetectors,
  listInsights,
  explainInsight,
  dismissInsight,
  submitFeedback,
  buildMonthlyDigest,
  askFinances,
} from '../modules/insights/public.js';
import {
  askFinancesSchema,
  submitInsightFeedbackSchema,
  runDetectorsBodySchema,
} from '../modules/insights/application/schemas/insights-schemas.js';

export async function insightRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // 1. List Insights
  fastify.get<{
    Querystring: {
      entityId?: string;
      status?: string;
      severity?: string;
      limit?: string;
    };
  }>('/insights', async (request, reply) => {
    const scope = request.scope!;
    const q = request.query;

    // Run detectors to ensure fresh insights
    await runDetectors(scope, { entityId: q.entityId }).catch((err) => {
      request.log.warn(err, '[insightRoutes] runDetectors error');
    });

    const items = await listInsights(scope, {
      entityId: q.entityId,
      status: q.status,
      severity: q.severity,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send({ items });
  });

  // 2. Monthly Digest ("Seu mês em 3 pontos")
  fastify.get<{
    Querystring: {
      month?: string;
    };
  }>('/insights/digest', async (request, reply) => {
    const scope = request.scope!;
    const result = await buildMonthlyDigest(scope, request.query.month);
    return reply.send(result);
  });

  // 3. Ask Finances ("Pergunte às suas finanças")
  fastify.post<{
    Body: {
      question: string;
    };
  }>('/insights/ask', async (request, reply) => {
    const scope = request.scope!;
    const body = askFinancesSchema.parse(request.body);

    const result = await askFinances(scope, body.question);
    return reply.send(result);
  });

  // 4. Explain Insight
  fastify.get<{
    Params: { id: string };
  }>('/insights/:id', async (request, reply) => {
    const scope = request.scope!;
    const result = await explainInsight(scope, request.params.id);
    return reply.send(result);
  });

  // 5. Dismiss Insight
  fastify.post<{
    Params: { id: string };
  }>('/insights/:id/dismiss', async (request, reply) => {
    const scope = request.scope!;
    const result = await dismissInsight(scope, request.params.id);
    return reply.send(result);
  });

  // 6. Submit Feedback
  fastify.post<{
    Params: { id: string };
    Body: {
      value: 'util' | 'inutil';
      reason?: string;
    };
  }>('/insights/:id/feedback', async (request, reply) => {
    const scope = request.scope!;
    const body = submitInsightFeedbackSchema.parse(request.body);
    const result = await submitFeedback(scope, {
      insightId: request.params.id,
      value: body.value,
      reason: body.reason,
    });
    return reply.send(result);
  });

  // 7. Manual Run Detectors
  fastify.post<{
    Body: {
      entityId?: string;
    };
  }>('/insights/run', async (request, reply) => {
    const scope = request.scope!;
    const body =
      request.body !== undefined && request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)
        ? runDetectorsBodySchema.parse(request.body)
        : {};
    const result = await runDetectors(scope, { entityId: body.entityId });
    return reply.send({ count: result.length, items: result });
  });
}

export default insightRoutes;
