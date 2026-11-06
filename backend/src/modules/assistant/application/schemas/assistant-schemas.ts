import { z } from 'zod';

export const chatAssistantSchema = z.object({
  message: z.string({ error: 'Mensagem é obrigatória.' }).min(1, 'Mensagem é obrigatória.').max(10000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(10000),
      })
    )
    .optional(),
});

export const proposeFromTextSchema = z.object({
  text: z.string({ error: 'Texto da mensagem é obrigatório.' }).min(1, 'Texto da mensagem é obrigatório.').max(10000),
  entityId: z.string().uuid().optional(),
});

export const assistantProposalParamSchema = z.object({
  id: z.string().uuid(),
});
