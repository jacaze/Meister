import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['receita', 'despesa']),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  type: z.enum(['receita', 'despesa']).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});
