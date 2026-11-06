import { z } from 'zod';

export const createSplitSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(255).optional(),
});

export const createTransactionSchema = z.object({
  entityId: z.string().uuid().optional(),
  type: z.enum(['receita', 'despesa', 'transferencia', 'aporte', 'retirada']),
  amount: z.union([z.string(), z.number()]),
  description: z.string().min(1, 'A descrição da transação é obrigatória').max(255, 'A descrição pode ter no máximo 255 caracteres'),
  occurredOn: z.string().optional(),
  transactionDate: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  splits: z.array(createSplitSchema).optional(),
  financialAccountId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro']).nullable().optional(),
  origin: z.enum(['manual', 'open_finance', 'importacao', 'telegram']).optional(),
  status: z.enum(['confirmado', 'pendente_revisao']).optional(),
  sourceRef: z.string().nullable().optional(),
  viaPersonalAccount: z.boolean().optional(),
});

export const updateTransactionSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  type: z.enum(['receita', 'despesa']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro']).nullable().optional(),
  transactionDate: z.string().optional(),
  status: z.enum(['confirmado', 'pendente_revisao']).optional(),
  splits: z.array(createSplitSchema).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createTransferSchema = z.object({
  fromAccountId: z.string().uuid('ID da conta de origem inválido'),
  toAccountId: z.string().uuid('ID da conta de destino inválido'),
  amount: z.union([z.string(), z.number()]),
  occurredOn: z.string().min(1, 'Data inválida'),
  description: z.string().max(255).optional(),
});

export const registerOwnerWithdrawalSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  occurredOn: z.string().min(1, 'Data inválida'),
  description: z.string().max(255).optional(),
});
