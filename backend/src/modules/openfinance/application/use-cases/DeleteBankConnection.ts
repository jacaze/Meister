import prisma from '../../../../config/prisma.js';
import { assertCanWrite, NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';

export async function deleteBankConnection(
  scope: WorkspaceScope,
  connectionId: string
): Promise<{ ok: boolean; message: string }> {
  assertCanWrite(scope);

  const connection = await prisma.bankConnection.findFirst({
    where: {
      id: connectionId,
      workspaceId: scope.workspaceId,
    },
  });

  if (!connection) {
    throw new NotFoundError('Conexão bancária não encontrada.');
  }

  await prisma.bankConnection.delete({
    where: { id: connectionId },
  });

  return { ok: true, message: 'Conexão bancária removida com sucesso.' };
}
