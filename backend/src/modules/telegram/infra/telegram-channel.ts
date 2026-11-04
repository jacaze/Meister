import type { MessagingChannel, SendMessageOptions } from '../application/ports/messaging-channel.js';

export class TelegramApiChannel implements MessagingChannel {
  private readonly botToken?: string;

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN;
  }

  async sendText(chatId: string, text: string, options?: SendMessageOptions): Promise<void> {
    if (!this.botToken) {
      console.log(`[TelegramApiChannel (MOCK)] To ${chatId}:\n${text}`);
      return;
    }

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode ?? 'MarkdownV2',
    };

    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.text();
        console.warn(`[TelegramApiChannel] sendMessage error: ${res.status} - ${errJson}`);
      }
    } catch (err) {
      console.error('[TelegramApiChannel] Failed to send message to Telegram API:', err);
    }
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<void> {
    if (!this.botToken) {
      console.log(`[TelegramApiChannel (MOCK)] Edit ${chatId} (msg: ${messageId}):\n${text}`);
      return;
    }

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parseMode ?? 'MarkdownV2',
    };

    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.text();
        console.warn(`[TelegramApiChannel] editMessageText error: ${res.status} - ${errJson}`);
      }
    } catch (err) {
      console.error('[TelegramApiChannel] Failed to edit message:', err);
    }
  }

  async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.botToken) {
      return;
    }

    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      });
    } catch (err) {
      console.error('[TelegramApiChannel] Failed to answer callback query:', err);
    }
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType?: string } | null> {
    if (!this.botToken) {
      return null;
    }

    try {
      const metaRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`);
      if (!metaRes.ok) return null;
      const meta = (await metaRes.json()) as { ok: boolean; result?: { file_path?: string } };
      if (!meta.ok || !meta.result?.file_path) return null;

      const fileRes = await fetch(`https://api.telegram.org/file/bot${this.botToken}/${meta.result.file_path}`);
      if (!fileRes.ok) return null;

      const arrayBuffer = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = meta.result.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return { buffer, mimeType };
    } catch (err) {
      console.error('[TelegramApiChannel] Failed to download file:', err);
      return null;
    }
  }
}
