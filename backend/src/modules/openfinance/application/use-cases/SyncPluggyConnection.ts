import prisma from '../../../../config/prisma.js';
import { assertCanWrite, NotFoundError, ValidationError, type WorkspaceScope } from '../../../../shared/index.js';
import type { BankingAggregator } from '../ports/BankingAggregator.js';
import { PluggyClient } from '../../infra/PluggyClient.js';
import { connectPluggyItem, type ConnectPluggyItemResult } from './ConnectPluggyItem.js';

export interface SyncPluggyConnectionInput {
  readonly connectionId: string;
  readonly aggregator?: BankingAggregator;
}

export async function syncPluggyConnection(
  scope: WorkspaceScope,
  input: SyncPluggyConnectionInput
): Promise<ConnectPluggyItemResult> {
  assertCanWrite(scope);

  const connection = await prisma.bankConnection.findFirst({
    where: {
      id: input.connectionId,
      workspaceId: scope.workspaceId,
    },
  });

  if (!connection) {
    throw new NotFoundError('Conexão bancária não encontrada.');
  }

  if (connection.provider !== 'pluggy' || !connection.itemId) {
    throw new ValidationError('Esta conexão não é gerenciada via Pluggy Open Finance.');
  }

  const client = input.aggregator || new PluggyClient();

  // Trigger sync on Pluggy
  try {
    await client.syncItem(connection.itemId);
  } catch (err) {
    console.warn(`[SyncPluggyConnection] Non-blocking warning on syncItem:`, err);
  }

  // Pull latest updates and transactions
  return connectPluggyItem(scope, {
    itemId: connection.itemId,
    aggregator: client,
    daysBack: 45,
  });
}
