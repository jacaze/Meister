import { z } from 'zod';

export const telegramWebhookUpdateSchema = z
  .object({
    update_id: z.number(),
    message: z
      .object({
        message_id: z.number().optional(),
        chat: z
          .object({
            id: z.number().or(z.string()),
            type: z.string().optional(),
            title: z.string().optional(),
            username: z.string().optional(),
          })
          .passthrough(),
        from: z
          .object({
            id: z.number().optional(),
            is_bot: z.boolean().optional(),
            first_name: z.string().optional(),
            username: z.string().optional(),
          })
          .passthrough()
          .optional(),
        date: z.number().optional(),
        text: z.string().max(10000).optional(),
        photo: z.array(z.any()).optional(),
        document: z.any().optional(),
        caption: z.string().max(10000).optional(),
      })
      .passthrough()
      .optional(),
    callback_query: z
      .object({
        id: z.string(),
        from: z
          .object({
            id: z.number(),
            is_bot: z.boolean().optional(),
            first_name: z.string().optional(),
            username: z.string().optional(),
          })
          .passthrough(),
        data: z.string().optional(),
        message: z
          .object({
            message_id: z.number(),
            chat: z
              .object({
                id: z.number().or(z.string()),
                type: z.string().optional(),
                title: z.string().optional(),
                username: z.string().optional(),
              })
              .passthrough(),
            date: z.number().optional(),
            text: z.string().max(10000).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
