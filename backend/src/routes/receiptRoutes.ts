import type { FastifyInstance } from 'fastify';
import type { PaymentMethod } from '@prisma/client';
import authMiddleware from '../middlewares/authMiddleware.js';
import { parseReceiptPhoto, registerReceipt } from '../modules/receipts/public.js';
import { createTransaction } from '../modules/ledger/public.js';
import {
  parseReceiptPhotoSchema,
  confirmReceiptSchema,
} from '../modules/receipts/application/schemas/receipt-schemas.js';

export async function receiptRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post<{
    Body: {
      imageBase64?: string;
      mimeType?: string;
      textOrQrUrl?: string;
      entityId?: string;
    };
  }>('/receipts/parse', async (request, reply) => {
    const scope = request.scope!;
    const body = parseReceiptPhotoSchema.parse(request.body || {});
    const result = await parseReceiptPhoto(scope, body);
    return reply.send(result);
  });

  fastify.post<{
    Body: {
      total: string;
      description?: string;
      date?: string;
      entityId?: string;
      paymentMethod?: PaymentMethod | null;
      accessKey?: string;
      issuerCnpj?: string;
      splits?: Array<{ categoryId: string; amount: string; description?: string }>;
      categoryId?: string;
    };
  }>('/receipts/confirm', async (request, reply) => {
    const scope = request.scope!;
    const body = confirmReceiptSchema.parse(request.body || {});

    const transaction = await createTransaction(scope, {
      type: 'despesa',
      amount: body.total,
      description: body.description || 'Despesa com Nota Fiscal/Comprovante',
      occurredOn: body.date,
      entityId: body.entityId,
      paymentMethod: body.paymentMethod,
      categoryId: body.splits && body.splits.length > 0 ? undefined : body.categoryId,
      splits: body.splits && body.splits.length >= 2 ? body.splits : undefined,
      sourceRef: body.accessKey ? `nfe:${body.accessKey}` : undefined,
    });

    if (body.accessKey) {
      try {
        await registerReceipt(scope, {
          accessKey: body.accessKey,
          issuerCnpj: body.issuerCnpj,
          issuedOn: body.date,
          total: String(body.total),
          source: 'ia',
        });
      } catch {
        // Ignored if receipt key was already registered or not present
      }
    }

    return reply.status(201).send(transaction);
  });
}

export default receiptRoutes;
