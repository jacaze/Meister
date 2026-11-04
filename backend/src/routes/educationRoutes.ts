import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  listLessons,
  getLesson,
  submitQuiz,
  completeLesson,
  askEducation,
  evaluateNudges,
  recordNudgeFeedback,
} from '../modules/education/public.js';

const submitQuizBodySchema = z.object({
  answers: z.array(z.number().int().min(0)),
});

const askQuestionBodySchema = z.object({
  question: z.string().min(1).max(500),
});

const nudgeFeedbackBodySchema = z.object({
  feedback: z.enum(['util', 'inutil']),
});

export async function educationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // 1. List all curated lessons with progress
  fastify.get('/education/lessons', async (request, reply) => {
    const scope = request.scope!;
    const result = await listLessons(scope);
    return reply.status(200).send(result);
  });

  // 2. Get specific lesson by slug
  fastify.get<{ Params: { slug: string } }>('/education/lessons/:slug', async (request, reply) => {
    const scope = request.scope!;
    try {
      const result = await getLesson(scope, request.params.slug);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  // 3. Submit quiz answers for a lesson
  fastify.post<{ Params: { slug: string }; Body: { answers: number[] } }>(
    '/education/lessons/:slug/quiz',
    async (request, reply) => {
      const scope = request.scope!;
      const parsed = submitQuizBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Respostas inválidas', details: parsed.error.issues });
      }

      try {
        const result = await submitQuiz(scope, request.params.slug, parsed.data.answers);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.status(status).send({ error: (err as Error).message });
      }
    }
  );

  // 4. Mark lesson as complete
  fastify.post<{ Params: { slug: string } }>('/education/lessons/:slug/complete', async (request, reply) => {
    const scope = request.scope!;
    try {
      const result = await completeLesson(scope, request.params.slug);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  // 5. Ask question about MEI education (RN-44 guarded)
  fastify.post<{ Body: { question: string } }>('/education/ask', async (request, reply) => {
    const parsed = askQuestionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Pergunta inválida', details: parsed.error.issues });
    }

    const result = askEducation(parsed.data.question);
    return reply.status(200).send(result);
  });

  // 6. Evaluate contextual nudges
  fastify.get('/education/nudges', async (request, reply) => {
    const scope = request.scope!;
    const nudges = await evaluateNudges(scope);
    return reply.status(200).send({ nudges });
  });

  // 7. Record nudge feedback
  fastify.post<{ Params: { id: string }; Body: { feedback: 'util' | 'inutil' } }>(
    '/education/nudges/:id/feedback',
    async (request, reply) => {
      const parsed = nudgeFeedbackBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Feedback inválido' });
      }

      await recordNudgeFeedback(request.params.id, parsed.data.feedback);
      return reply.status(200).send({ success: true });
    }
  );
}

export default educationRoutes;
