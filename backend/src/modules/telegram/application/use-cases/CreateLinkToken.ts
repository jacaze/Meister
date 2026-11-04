import crypto from 'node:crypto';
import prisma from '../../../../config/prisma.js';
import { assertCanWrite, type WorkspaceScope } from '../../../../shared/index.js';

export async function createLinkToken(scope: WorkspaceScope): Promise<{ token: string; expiresAt: Date; botUsername?: string }> {
  assertCanWrite(scope);

  // Generate 32 bytes base64url (~43 chars)
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min TTL

  await prisma.telegramLinkToken.create({
    data: {\n      token,
      workspaceId: scope.workspaceId,
      userId: scope.actorUserId,
      expiresAt,
    },\n  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'MeisterAssistenteBot';

  return { token, expiresAt, botUsername };
}
