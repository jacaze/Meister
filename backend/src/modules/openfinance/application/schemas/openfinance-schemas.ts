import { z } from 'zod';

export const connectPluggyItemSchema = z.object({
  itemId: z.string({ error: 'O itemId retornado pelo Pluggy Connect é obrigatório.' })
    .min(1, 'O itemId retornado pelo Pluggy Connect é obrigatório.')
    .max(255),
  entityId: z.string().uuid().optional(),
});

export const importStatementSchema = z.object({
  content: z.string().min(1).max(10_485_760),
  provider: z.enum(['ofx', 'csv', 'pluggy']).optional(),
  institution: z.string().max(255).optional(),
  entityId: z.string().uuid().optional(),
});

export const approveImportedTransactionSchema = z.object({
  bankTransactionId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  viaPersonalAccount: z.boolean().optional(),
});

export const batchApproveImportedTransactionItemSchema = z.object({
  bankTransactionId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
});

export const batchApproveImportedTransactionsSchema = z.object({
  items: z.array(batchApproveImportedTransactionItemSchema).max(500),
});

export const ignoreImportedTransactionSchema = z.object({
  bankTransactionId: z.string().uuid(),
});
