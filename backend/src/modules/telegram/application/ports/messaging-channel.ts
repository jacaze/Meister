export interface SendMessageOptions {
  readonly parseMode?: 'MarkdownV2' | 'HTML';
  readonly replyMarkup?: unknown;
}

export interface MessagingChannel {
  sendText(chatId: string, text: string, options?: SendMessageOptions): Promise<void>;
  editMessageText(chatId: string, messageId: number, text: string, options?: SendMessageOptions): Promise<void>;
  answerCallback(callbackQueryId: string, text?: string): Promise<void>;
}
