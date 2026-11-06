import { z } from 'zod';

export const markDasPaidSchema = z.object({
  paidOn: z.string().min(1, 'Data de pagamento é obrigatória'),
  paidAmount: z.union([z.string(), z.number()]).optional(),
});
