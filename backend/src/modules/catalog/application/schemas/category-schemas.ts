import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string({ error: 'Nome e tipo da categoria são obrigatórios' }).min(1, 'Nome e tipo da categoria são obrigatórios').max(60, 'O nome da categoria pode ter no máximo 60 caracteres'),
  type: z.enum(['receita', 'despesa'], { error: 'Tipo de categoria inválido. Use "receita" ou "despesa"' }),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  type: z.enum(['receita', 'despesa']).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});
