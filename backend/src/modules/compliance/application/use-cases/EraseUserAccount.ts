import bcrypt from 'bcryptjs';
import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { UnauthorizedError } from '../../../../shared/errors.js';
import { writeAuditLog } from './WriteAuditLog.js';

export async function eraseUserAccount(
  scope: WorkspaceScope,
  passwordConfirm: string
): Promise<{ success: boolean; message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: scope.actorUserId },
  });

  if (!user) {
    throw new UnauthorizedError('Usuário não encontrado.');
  }

  const isPasswordValid = await bcrypt.compare(passwordConfirm, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Senha incorreta. A exclusão de conta foi cancelada por segurança.');
  }

  // 1. Audit log before revocation
  await writeAuditLog({
    workspaceId: scope.workspaceId,
    userId: user.id,
    actor: user.email,
    action: 'compliance.erase',
    target: user.id,
    meta: { requestedAt: new Date().toISOString() },
  });

  // 2. Disconnect bank connections
  await prisma.bankConnection.deleteMany({
    where: { workspaceId: scope.workspaceId },
  });

  // 3. Clear sessions and tokens
  await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  await prisma.emailToken.deleteMany({
    where: { userId: user.id },
  });

  await prisma.telegramLink.deleteMany({
    where: { userId: user.id },
  });

  await prisma.userConsent.deleteMany({
    where: { userId: user.id },
  });

  await prisma.lessonProgress.deleteMany({
    where: { userId: user.id },
  });

  // 4. Anonymize user record
  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: `anon_${user.id}@deleted.local`,
      name: 'Usuário Removido',
      passwordHash: 'DELETED',
      status: 'excluido',
      deletedAt: new Date(),
    },
  });

  return {
    success: true,
    message: 'Conta encerrada e dados pessoais anonimizados conforme LGPD.',
  };
}
