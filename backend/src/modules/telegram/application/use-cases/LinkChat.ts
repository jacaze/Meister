import prisma from '../../../../config/prisma.js';
import { ValidationError } from '../../../../shared/index.js';

export interface LinkChatInput {
  readonly token: string;
  readonly chatId: string;
  readonly telegramUserId: string;
  readonly username?: string;
  readonly firstName?: string;
}

export async function linkChat(input: LinkChatInput): Promise<{ workspaceId: string; workspaceName: string }> {
  const linkToken = await prisma.telegramLinkToken.findUnique({
    where: { token: input.token },
    include: { workspace: true },
  });

  if (!linkToken) {
    throw new ValidationError('Token de vinculação inválido.');
  }

  if (linkToken.consumedAt || linkToken.expiresAt < new Date()) {
    throw new ValidationError('Este token de vinculação expirou ou já foi utilizado.');
  }

  // Transaction: consume token + upsert chat connection
  const res = await prisma.$transaction(async (tx) => {
    await tx.telegramLinkToken.update({
      where: { id: linkToken.id },
      data: { consumedAt: new Date() },
    });

    await tx.telegramChatConnection.upsert({
      where: { chatId: input.chatId },
      create: {
        workspaceId: linkToken.workspaceId,
        userId: linkToken.userId,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        username: input.username,
        firstName: input.firstName,
        status: 'active',
      },
      update: {
        workspaceId: linkToken.workspaceId,
        userId: linkToken.userId,
        telegramUserId: input.telegramUserId,
        username: input.username,
        firstName: input.firstName,
        status: 'active',
      },
    });

    return linkToken.workspace;
  });

  return {
    workspaceId: res.id,
    workspaceName: res.name,
  };
}
