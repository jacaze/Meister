import { z } from 'zod';

export const registerUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().min(1).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  password: z.string().min(1).max(255),
  accountType: z.enum(['mei', 'pessoa_fisica']).optional(),
});

export const loginUserSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(255),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  accountType: z.enum(['mei', 'pessoa_fisica']).optional(),
}).refine(
  (data) => data.name !== undefined || data.accountType !== undefined
);
