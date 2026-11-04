import type { MessagingChannel, SendMessageOptions } from '../application/ports/messaging-channel.js';

export class TelegramApiChannel implements MessagingChannel {
  private readonly botToken: string;
  private readonly baseUrl: string;

  constructor(token?: string) {
    this.botToken = token || process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: SendMessageOptions
  ): Promise<{ messageId: number }> {
    if (!this.botToken) {
      console.warn('[TelegramApiChannel] No bot token configured, mock sending message:', text);
      return { messageId: 1 };
    }

    const payload: any = {
      chat_id: chatId,
      text,
    };
    if (options?.parseMode) {
      payload.parse_mode = options.parseMode;
    }
    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[TelegramApiChannel] sendMessage failed:', err);
      throw new Error(`Telegram sendMessage failed: ${err}`);
    }

    const data = (await res.json()) as any;
    return { messageId: data.result?.message_id || 1 };
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<void> {
    if (!this.botToken) {
      return;
    }

    const payload: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    if (options?.parseMode) {
      payload.parse_mode = options.parseMode;
    }
    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    await fetch(`${this.baseUrl}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.botToken) return;

    await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  }
}
