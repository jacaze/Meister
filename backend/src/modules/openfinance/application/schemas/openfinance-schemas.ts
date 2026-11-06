import { z } from 'zod';

export const connectPluggyItemSchema = z.object({
  itemId: z.string({ error: 'O itemId retornado pelo Pluggy Connect é obrigatório.' })
    .min(1, 'O itemId retornado pelo Pluggy Connect é obrigatório.')
    .max(255),
  entityId: z.string().uuid('ID da entidade deve ser um UUID válido').optional(),
});

export const importStatementSchema = z.object({
  content: z.string().min(1, 'O conteúdo do extrato (OFX ou CSV) é obrigatório.').max(10 * 1024 * 1024),
  provider: z.enum(['ofx', 'csv', 'pluggy']).optional(),
  institution: z.string().max(255).optional(),
  entityId: z.string().uuid('ID da entidade deve ser um UUID válido').optional(),
});

export const approveImportedTransactionSchema = z.object({
  bankTransactionId: z.string().uuid('bankTransactionId deve ser um UUID válido'),
  categoryId: z.string().uuid('categoryId deve ser um UUID válido').optional(),
  entityId: z.string().uuid('entityId deve ser um UUID válido').optional(),
  viaPersonalAccount: z.boolean().optional(),
});

export const batchApproveImportedTransactionItemSchema = z.object({
  bankTransactionId: z.string().uuid('bankTransactionId deve ser um UUID válido'),
  categoryId: z.string().uuid('categoryId deve ser um UUID válido').optional(),
  entityId: z.string().uuid('entityId deve ser um UUID válido').optional(),
});

export const batchApproveImportedTransactionsSchema = z.object({
  items: z.array(batchApproveImportedTransactionItemSchema).max(500),
});

export const ignoreImportedTransactionSchema = z.object({
  bankTransactionId: z.string().uuid('bankTransactionId deve ser um UUID válido'),
});
