import { z } from 'zod';

export const ExtractionSchema = z.object({
  intent: z.enum(['lancamento', 'consulta', 'outro']),
  documentKind: z.enum([
    'texto_livre',
    'cupom_fiscal',
    'comprovante_pix',
    'recibo',
    'boleto',
    'fatura_cartao',
    'outro_documento',
    'nao_e_documento',
  ]),
  type: z.enum(['receita', 'despesa']).nullable(),
  amount: z.string().regex(/^\d{1,10}\.\d{2}$/).nullable(),
  dateIso: z.string().nullable(),
  dateExpression: z.string().max(40).nullable(),
  description: z.string().max(255).nullable(),
  merchant: z.string().max(120).nullable(),
  categorySlug: z.string().max(60).nullable(),
  paymentMethod: z
    .enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'outro'])
    .nullable(),
  scope: z.enum(['pj', 'pf', 'indefinido']),
  items: z
    .array(
      z.object({
        description: z.string().max(120),
        quantity: z.string().nullable().optional(),
        total: z.string().regex(/^\d{1,10}\.\d{2}$/),
      })
    )
    .max(80)
    .default([]),
  confidence: z.number().min(0).max(1),
  ambiguous: z.array(z.enum(['amount', 'date', 'type', 'category', 'scope'])).default([]),
  query: z.enum(['saldo', 'limite', 'das', 'potes', 'resumo_mes', 'ultimos']).nullable().optional(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
