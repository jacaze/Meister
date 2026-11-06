import { z } from 'zod';

export const updateBusinessProfileSchema = z.object({
  legalName: z.string().max(255).optional(),
  tradeName: z.string().max(255).optional(),
  taxId: z.string().max(20).optional(),
  meiCategory: z.string().max(100).optional(),
  cnae: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
});
