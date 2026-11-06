import { z } from 'zod';

/**
 * Id opcional que a tela pode mandar como `null` (ex.: categoria sugerida vazia vinda de coluna nula).
 * `null` e ausente significam a mesma coisa — "use o padrão" — e chegam ao caso de uso como `undefined`.
 */
const optionalUuid = z.string().uuid().nullish().transform((v) => v ?? undefined);

export const connectPluggyItemSchema = z.object({
  itemId: z.string({ error: 'O itemId retornado pelo Pluggy Connect é obrigatório.' })
    .min(1, 'O itemId retornado pelo Pluggy Connect é obrigatório.')
    .max(255),
  entityId: optionalUuid,
});

export const importStatementSchema = z.object({
  content: z.string().min(1).max(10_485_760),
  provider: z.enum(['ofx', 'csv', 'pluggy']).optional(),
  institution: z.string().max(255).optional(),
  entityId: optionalUuid,
});

export const approveImportedTransactionSchema = z.object({
  bankTransactionId: z.string().uuid(),
  categoryId: optionalUuid,
  entityId: optionalUuid,
  viaPersonalAccount: z.boolean().optional(),
});

export const batchApproveImportedTransactionItemSchema = z.object({
  bankTransactionId: z.string().uuid(),
  categoryId: optionalUuid,
  entityId: optionalUuid,
});

export const batchApproveImportedTransactionsSchema = z.object({
  items: z.array(batchApproveImportedTransactionItemSchema).max(500),
});

export const ignoreImportedTransactionSchema = z.object({
  bankTransactionId: z.string().uuid(),
});
