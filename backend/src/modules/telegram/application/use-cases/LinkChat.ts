import crypto from 'node:crypto';
import prisma from '../../../../config/prisma.js';
import type { MessagingChannel } from '../ports/messaging-channel.js';
import { MessagesPtBr } from '../../domain/messages.pt-BR.js';
import { resolveScopeForUser } from '../../../workspace/public.js';

export interface LinkChatInput {
  readonly chatId: string;
  readonly telegramUserId?: string;
  readonly token: string;
  readonly channel: MessagingChannel;
}

export type LinkChatResult =
  | { readonly success: true; readonly userName: string; readonly workspaceName: string }
  | { readonly success: false; readonly reason: 'invalid_or_expired' | 'already_linked' };

export async function linkChat(input: LinkChatInput): Promise<LinkChatResult> {
  const tokenHash = crypto.createHash('sha256').update(input.token.trim()).digest('hex');

  const tokenRecord = await prisma.telegramLinkToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!tokenRecord) {
    await input.channel.sendText(input.chatId, MessagesPtBr.invalidOrExpiredToken);
    return { success: false, reason: 'invalid_or_expired' };
  }

  // Resolve scope for user to get workspace
  const scope = await resolveScopeForUser(tokenRecord.userId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: scope.workspaceId },
  });

  // Upsert telegram link for this chatId
  await prisma.telegramLink.upsert({
    where: { chatId: input.chatId },
    create: {
      userId: tokenRecord.userId,
      workspaceId: scope.workspaceId,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId ?? null,
      status: 'ativo',
    },
    update: {
      userId: tokenRecord.userId,
      workspaceId: scope.workspaceId,
      telegramUserId: input.telegramUserId ?? null,
      status: 'ativo',
      revokedAt: null,
    },
  });

  // Mark token as used
  await prisma.telegramLinkToken.update({
    where: { id: tokenRecord.id },
    data: { usedAt: new Date() },
  });

  const userName = tokenRecord.user.name;
  const workspaceName = workspace?.name ?? 'Meu Workspace';

  await input.channel.sendText(
    input.chatId,
    MessagesPtBr.linkSuccess(userName, workspaceName)
  );

  return {
    success: true,
    userName,
    workspaceName,
  };
}
