import { z } from 'zod';

export const updateBusinessProfileSchema = z.object({
  cnpj: z.string().min(1),
  legalName: z.string().max(255).nullable().optional(),
  tradeName: z.string().max(255).nullable().optional(),
  openedOn: z.string().min(1),
  activity: z.enum(['comercio', 'servicos', 'misto']),
});

export const onboardingSchema = z.object({
  profile: z.enum(['individual', 'negocio', 'familia', 'familia_negocio']),
  businesses: z
    .array(
      z.object({
        type: z.enum(['mei', 'pj', 'autonomo']),
        name: z.string().trim().min(1).max(120),
      })
    )
    .max(10)
    .default([]),
});

export type OnboardingBody = z.infer<typeof onboardingSchema>;

export type UpdateBusinessProfileBody = z.infer<typeof updateBusinessProfileSchema>;
