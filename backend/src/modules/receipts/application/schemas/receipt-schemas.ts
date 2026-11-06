import { z } from 'zod';

export const parseReceiptPhotoSchema = z.object({
  imageBase64: z.string().trim().min(20).max(15_728_640).optional(),
  mimeType: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/).max(100).optional(),
  textOrQrUrl: z.string().trim().min(10).max(2048).optional(),
  entityId: z.string().uuid().optional(),
}).refine(
  (data) => Boolean(data.imageBase64 || data.textOrQrUrl)
);

export const confirmReceiptSplitSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(1000).optional(),
});

export const confirmReceiptSchema = z.object({
  total: z.union([z.string(), z.number()]),
  description: z.string().max(1000).optional(),
  date: z.string().optional(),
  entityId: z.string().uuid().optional(),
  paymentMethod: z.enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro']).nullable().optional(),
  accessKey: z.string().max(100).optional(),
  issuerCnpj: z.string().max(20).optional(),
  splits: z.array(confirmReceiptSplitSchema).optional(),
  categoryId: z.string().uuid().optional(),
});
