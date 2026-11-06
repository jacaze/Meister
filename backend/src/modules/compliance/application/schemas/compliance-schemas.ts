import { z } from 'zod';

export const recordConsentSchema = z.object({
  kind: z.enum(['terms', 'privacy', 'ai_processing', 'open_finance']),
  version: z.string().max(50).optional(),
  accepted: z.boolean(),
});

export const eraseAccountSchema = z.object({
  password: z.string().min(1).max(255),
});
