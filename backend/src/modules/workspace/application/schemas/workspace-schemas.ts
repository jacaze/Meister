import { z } from 'zod';

export const updateBusinessProfileSchema = z.object({
  cnpj: z.string().min(1),
  legalName: z.string().max(255).nullable().optional(),
  tradeName: z.string().max(255).nullable().optional(),
  openedOn: z.string().min(1),
  activity: z.enum(['comercio', 'servicos', 'misto']),
});

export type UpdateBusinessProfileBody = z.infer<typeof updateBusinessProfileSchema>;
