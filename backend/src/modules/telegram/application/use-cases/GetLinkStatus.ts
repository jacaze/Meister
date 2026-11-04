import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';

export interface TelegramLinkStatus {
  readonly linked: boolean;
  readonly chatId?: string;
  readonly linkedAt?: string;
}

export async function getTelegramLinkStatus(scope: WorkspaceScope): Promise<TelegramLinkStatus> {
  const link = await prisma.telegramLink.findFirst({
    where: {
      userId: scope.actorUserId,
      workspaceId: scope.workspaceId,
      status: 'ativo',
    },
  });

  if (!link) {
    return { linked: false };
  }

  return {
    linked: true,
    chatId: link.chatId,
    linkedAt: link.linkedAt.toISOString(),
  };
}

export async function unlinkChat(scope: WorkspaceScope): Promise<{ success: boolean }> {
  await prisma.telegramLink.updateMany({
    where: {
      userId: scope.actorUserId,
      workspaceId: scope.workspaceId,
      status: 'ativo',
    },
    data: {
      status: 'revogado',
      revokedAt: new Date(),
    },
  });

  return { success: true };
}
