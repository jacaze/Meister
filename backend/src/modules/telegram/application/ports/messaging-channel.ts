export interface InlineKeyboardButton {
  readonly text: string;
  readonly callback_data?: string;
  readonly url?: string;
}

export interface SendMessageOptions {
  readonly parseMode?: 'MarkdownV2' | 'HTML';
  readonly replyMarkup?: {
    readonly inline_keyboard?: InlineKeyboardButton[][];
  };
}

export interface MessagingChannel {
  sendMessage(chatId: string | number, text: string, options?: SendMessageOptions): Promise<{ messageId: number }>;
  editMessageText(chatId: string | number, messageId: number, text: string, options?: SendMessageOptions): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}
