import type { FastifyInstance } from 'fastify';
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
import {
  submitQuizBodySchema,
  askQuestionBodySchema,
  nudgeFeedbackBodySchema,
} from '../modules/education/application/schemas/education-schemas.js';

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
    const result = await getLesson(scope, request.params.slug);
    return reply.status(200).send(result);
  });

  // 3. Submit quiz answers for a lesson
  fastify.post<{ Params: { slug: string }; Body: { answers: number[] } }>(
    '/education/lessons/:slug/quiz',
    async (request, reply) => {
      const scope = request.scope!;
      const body = submitQuizBodySchema.parse(request.body);
      const result = await submitQuiz(scope, request.params.slug, body.answers);
      return reply.status(200).send(result);
    }
  );

  // 4. Mark lesson as complete
  fastify.post<{ Params: { slug: string } }>('/education/lessons/:slug/complete', async (request, reply) => {
    const scope = request.scope!;
    const result = await completeLesson(scope, request.params.slug);
    return reply.status(200).send(result);
  });

  // 5. Ask question about MEI education (RN-44 guarded)
  fastify.post<{ Body: { question: string } }>('/education/ask', async (request, reply) => {
    const body = askQuestionBodySchema.parse(request.body);
    const result = askEducation(body.question);
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
      const body = nudgeFeedbackBodySchema.parse(request.body);
      await recordNudgeFeedback(request.params.id, body.feedback);
      return reply.status(200).send({ success: true });
    }
  );
}

export default educationRoutes;
