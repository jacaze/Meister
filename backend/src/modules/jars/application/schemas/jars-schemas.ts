import { z } from 'zod';

export const customJarInputSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  percent: z.number().min(0).max(100).optional(),
  fixedAmount: z.union([z.string(), z.number()]).optional(),
  rollover: z.boolean().optional(),
  goalAmount: z.union([z.string(), z.number()]).optional(),
  goalDate: z.string().optional(),
});

export const createJarPlanSchema = z.object({
  entityId: z.string().uuid('ID da entidade deve ser um UUID válido').optional(),
  name: z.string().max(100).optional(),
  templateSlug: z.string().max(100).optional(),
  baseMode: z.enum(['mes_atual', 'mes_anterior', 'media_3_meses'], {
    error: 'Base de cálculo inválida. Use mes_atual, mes_anterior ou media_3_meses',
  }).optional(),
  customJars: z.array(customJarInputSchema).optional(),
});

export const mapCategoriesSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  jarId: z.string().min(1, 'ID do pote é obrigatório'),
  categoryIds: z.array(z.string()).default([]),
});

export const batchMapCategoriesSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  mappings: z.array(
    z.object({
      jarId: z.string().min(1, 'ID do pote é obrigatório'),
      categoryIds: z.array(z.string()).default([]),
    })
  ).min(1, 'Lista de mapeamentos não pode ser vazia'),
});
