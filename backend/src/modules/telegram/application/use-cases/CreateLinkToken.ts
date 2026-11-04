import crypto from 'node:crypto';
import prisma from '../../../../config/prisma.js';
import { assertCanWrite, type WorkspaceScope } from '../../../../shared/index.js';

export interface CreateLinkTokenResult {
  readonly token: string;
  readonly botUrl: string;
  readonly expiresAt: string;
}

export async function createLinkToken(scope: WorkspaceScope): Promise<CreateLinkTokenResult> {
  assertCanWrite(scope);

  // Generate 32 bytes base64url token (43 chars)
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.telegramLinkToken.create({
    data: {
      userId: scope.actorUserId,
      tokenHash,
      expiresAt,
    },
  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'meister_financas_bot';
  const botUrl = `https://t.me/${botUsername}?start=${token}`;

  return {
    token,
    botUrl,
    expiresAt: expiresAt.toISOString(),
  };
}
