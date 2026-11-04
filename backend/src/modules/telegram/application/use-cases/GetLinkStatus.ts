import prisma from '../../../../config/prisma.js';
import { assertCanRead, type WorkspaceScope } from '../../../../shared/index.js';

export interface TelegramLinkStatus {
  readonly isLinked: boolean;
  readonly chatId?: string;
  readonly username?: string;
  readonly firstName?: string;
  readonly linkedAt?: Date;
  readonly botUsername?: string;
}

export async function getLinkStatus(scope: WorkspaceScope): Promise<TelegramLinkStatus> {
  assertCanRead(scope);

  const connection = await prisma.telegramChatConnection.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      status: 'active',
    },
    orderBy: { createdAt: 'desc' },
  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'MeisterAssistenteBot';

  if (!connection) {
    return { isLinked: false, botUsername };
  }

  return {
    isLinked: true,
    chatId: connection.chatId,
    username: connection.username ?? undefined,
    firstName: connection.firstName ?? undefined,
    linkedAt: connection.createdAt,
    botUsername,
  };
}
