import { z } from 'zod';
import { classifyPluggyWebhookEvent } from '../../domain/pluggy-webhook-policy.js';

const optionalNonEmptyString = (max: number) => z.string().trim().min(1).max(max).nullish();
const optionalIsoDatetime = z.iso.datetime({ offset: true }).nullish();

export const pluggyWebhookPayloadSchema = z
  .object({
    event: z
      .string({ error: 'O campo event é obrigatório no webhook da Pluggy.' })
      .trim()
      .min(1, 'O campo event é obrigatório no webhook da Pluggy.')
      .max(120),
    eventId: optionalNonEmptyString(255),
    clientId: optionalNonEmptyString(255),
    triggeredBy: optionalNonEmptyString(64),
    itemId: optionalNonEmptyString(255),
    accountId: optionalNonEmptyString(255),
    transactionIds: z.array(z.string().trim().min(1).max(255)).max(1000).nullish(),
    consentExpiresAt: optionalIsoDatetime,
    error: z
      .object({
        code: optionalNonEmptyString(120),
        message: z.string().max(4000).nullish(),
      })
      .passthrough()
      .nullish(),
    item: z
      .object({
        consentExpiresAt: optionalIsoDatetime,
      })
      .passthrough()
      .nullish(),
    data: z
      .object({
        consentExpiresAt: optionalIsoDatetime,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const action = classifyPluggyWebhookEvent(data.event);
    if (action !== 'ignore' && !data.itemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itemId'],
        message: 'itemId é obrigatório para eventos de item ou transação da Pluggy.',
      });
    }

    if (data.event === 'transactions/deleted' && !data.transactionIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['transactionIds'],
        message: 'transactionIds é obrigatório no evento transactions/deleted.',
      });
    }
  });

export type PluggyWebhookPayload = z.infer<typeof pluggyWebhookPayloadSchema>;
