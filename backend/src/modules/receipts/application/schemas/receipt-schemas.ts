import { z } from 'zod';

export const parseReceiptPhotoSchema = z.object({
  imageBase64: z.string().optional(),
  mimeType: z.string().max(100).optional(),
  textOrQrUrl: z.string().max(2048).optional(),
  entityId: z.string().uuid('ID da entidade deve ser um UUID válido').optional(),
});

export const confirmReceiptSplitSchema = z.object({
  categoryId: z.string().uuid('ID da categoria deve ser um UUID válido'),
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(255).optional(),
});

export const confirmReceiptSchema = z.object({
  total: z.union([z.string(), z.number()], { error: 'O valor total é obrigatório' }),
  description: z.string().max(255).optional(),
  date: z.string().optional(),
  entityId: z.string().uuid('ID da entidade deve ser um UUID válido').optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro']).nullable().optional(),
  accessKey: z.string().max(100).optional(),
  issuerCnpj: z.string().max(20).optional(),
  splits: z.array(confirmReceiptSplitSchema).optional(),
  categoryId: z.string().uuid('ID da categoria deve ser um UUID válido').optional(),
});
