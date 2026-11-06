import { z } from 'zod';

export const createSplitSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(1000).optional(),
});

export const createTransactionSchema = z.object({
  // Chamadores internos (assistente, Telegram, Open Finance) podem repassar entidade nula do rascunho.
  entityId: z.string().nullish().transform((v) => v ?? undefined),
  type: z.enum(['receita', 'despesa', 'transferencia', 'aporte', 'retirada']),
  amount: z.union([z.string(), z.number()]),
  description: z.string().min(1).max(1000),
  occurredOn: z.string().optional(),
  transactionDate: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  splits: z.array(createSplitSchema).optional(),
  financialAccountId: z.string().nullable().optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro']).nullable().optional(),
  origin: z.enum(['manual', 'open_finance', 'importacao', 'telegram']).optional(),
  status: z.enum(['confirmado', 'pendente_revisao']).optional(),
  sourceRef: z.string().nullable().optional(),
  viaPersonalAccount: z.boolean().optional(),
});

export const updateTransactionSchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  type: z.enum(['receita', 'despesa']).optional(),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro']).nullable().optional(),
  transactionDate: z.string().optional(),
  status: z.enum(['confirmado', 'pendente_revisao']).optional(),
  splits: z.array(createSplitSchema).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  viaPersonalAccount: z.boolean().optional(),
});

export const httpCreateTransactionSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  amount: z.union([z.string(), z.number()]),
  type: z.enum(['receita', 'despesa']),
  categoryId: z.string().min(1),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro', '']).nullable().optional(),
  transactionDate: z.string().min(1),
  entityId: z.string().optional(),
  viaPersonalAccount: z.boolean().optional(),
  sourceRef: z.string().max(255).nullable().optional(),
});

export const httpUpdateTransactionSchema = z.object({
  description: z.string().trim().min(1).max(1000).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  type: z.enum(['receita', 'despesa']).optional(),
  categoryId: z.string().min(1).optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro', '']).nullable().optional(),
  transactionDate: z.string().min(1).optional(),
  viaPersonalAccount: z.boolean().optional(),
});

export const createTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  occurredOn: z.string().min(1),
  description: z.string().max(1000).optional(),
});

export const registerOwnerWithdrawalSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  occurredOn: z.string().min(1),
  description: z.string().max(1000).optional(),
});
