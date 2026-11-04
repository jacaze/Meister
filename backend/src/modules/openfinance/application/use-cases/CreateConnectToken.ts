import { assertCanWrite, type WorkspaceScope } from '../../../../shared/index.js';
import type { BankingAggregator } from '../ports/BankingAggregator.js';
import { PluggyClient } from '../../infra/PluggyClient.js';

export interface CreateConnectTokenInput {
  readonly aggregator?: BankingAggregator;
}

export async function createConnectToken(
  scope: WorkspaceScope,
  input?: CreateConnectTokenInput
): Promise<{ accessToken: string }> {
  assertCanWrite(scope);

  const client = input?.aggregator || new PluggyClient();
  const accessToken = await client.createConnectToken({
    clientUserId: scope.actorUserId,
  });

  return { accessToken };
}
