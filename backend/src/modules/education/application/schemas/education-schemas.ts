import { z } from 'zod';

export const submitQuizBodySchema = z.object({
  answers: z.array(z.number().int().min(0)).min(1).max(100),
});

export const askQuestionBodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  contextId: z.string().uuid().optional(),
});

export const nudgeFeedbackBodySchema = z.object({
  feedback: z.enum(['util', 'inutil']),
});
