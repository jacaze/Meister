import { z } from 'zod';

export const askFinancesSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  entityId: z.string().uuid().optional(),
});

export const submitInsightFeedbackSchema = z.object({
  value: z.enum(['util', 'inutil']),
  reason: z.string().max(1000).optional(),
});

export const runDetectorsBodySchema = z.object({
  entityId: z.string().uuid().optional(),
});
