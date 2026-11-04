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

    const payload: Record<string, any> = {
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

    const payload: Record<string, any> = {
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
}
