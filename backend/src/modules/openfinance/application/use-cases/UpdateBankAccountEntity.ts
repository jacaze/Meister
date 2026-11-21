import prisma from '../../../../config/prisma.js';
import { assertCanWrite, NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';
import type { ConnectedBankAccount } from './ConnectPluggyItem.js';

export interface UpdateBankAccountEntityInput {
  readonly bankAccountId: string;
  readonly entityId: string;
}

// Diz de qual entidade (PF, PJ...) é uma conta bancária. Lançamentos já aprovados não mudam;
// os itens ainda na Caixa de Revisão passam a ser aprovados na nova entidade.
export async function updateBankAccountEntity(
  scope: WorkspaceScope,
  input: UpdateBankAccountEntityInput
): Promise<ConnectedBankAccount> {
  assertCanWrite(scope);

  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, connection: { workspaceId: scope.workspaceId } },
    select: { id: true },
  });
  if (!account) throw new NotFoundError('Conta bancária não encontrada.');

  const entity = await prisma.entity.findFirst({
    where: { id: input.entityId, workspaceId: scope.workspaceId, active: true },
    select: { id: true },
  });
  if (!entity) throw new NotFoundError('Entidade não encontrada.');

  const updated = await prisma.bankAccount.update({
    where: { id: account.id },
    data: { entityId: entity.id },
    select: { id: true, name: true, kind: true, entityId: true },
  });
  return updated;
}
