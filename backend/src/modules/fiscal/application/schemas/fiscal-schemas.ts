import { z } from 'zod';

export const markDasPaidSchema = z.object({
  paidOn: z.string().min(1),
  paidAmount: z.union([z.string(), z.number()]).optional(),
});
