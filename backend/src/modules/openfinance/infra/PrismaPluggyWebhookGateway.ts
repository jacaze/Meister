import prisma from '../../../config/prisma.js';
import type { WorkspaceScope } from '../../../shared/index.js';
import type { BankingAggregator } from '../application/ports/BankingAggregator.js';
import type {
  MarkConnectionErrorInput,
  PluggyWebhookConnectionRecord,
  PluggyWebhookEntityRecord,
  PluggyWebhookGateway,
} from '../application/ports/PluggyWebhookGateway.js';
import { syncPluggyConnection } from '../application/use-cases/SyncPluggyConnection.js';

export type WebhookSystemScopeBuilder = (
  workspaceId: string,
  entities: ReadonlyArray<PluggyWebhookEntityRecord>
) => WorkspaceScope;

export interface PrismaPluggyWebhookGatewayOptions {
  readonly buildSystemScope: WebhookSystemScopeBuilder;
  readonly aggregator?: BankingAggregator;
}

export class PrismaPluggyWebhookGateway implements PluggyWebhookGateway {
  private readonly buildSystemScope: WebhookSystemScopeBuilder;
  private readonly aggregator?: BankingAggregator;

  public constructor(options: PrismaPluggyWebhookGatewayOptions) {
    this.buildSystemScope = options.buildSystemScope;
    this.aggregator = options.aggregator;
  }

  public async findConnectionByItemId(
    itemId: string
  ): Promise<PluggyWebhookConnectionRecord | null> {
    const connection = await prisma.bankConnection.findFirst({
      where: { provider: 'pluggy', itemId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        workspace: {
          select: {
            entities: {
              select: { id: true, kind: true, isMei: true, active: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!connection) {
      return null;
    }

    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      status: connection.status,
      entities: connection.workspace.entities,
    };
  }

  public async syncConnectionFromWebhook(
    connection: PluggyWebhookConnectionRecord
  ): Promise<void> {
    const scope = this.buildSystemScope(connection.workspaceId, connection.entities);
    // Nunca aciona client.syncItem() dentro do webhook para evitar loop infinito de item/updated
    await syncPluggyConnection(scope, {
      connectionId: connection.id,
      aggregator: this.aggregator,
      triggerRemoteSync: false,
    });
  }

  public async markConnectionError(
    connectionId: string,
    input: MarkConnectionErrorInput
  ): Promise<void> {
    await prisma.bankConnection.updateMany({
      where: {
        id: connectionId,
        status: { not: 'revogada' },
      },
      data: {
        status: 'erro',
        lastError: input.lastError,
        ...(input.consentExpiresAt !== undefined
          ? { consentExpiresAt: input.consentExpiresAt }
          : {}),
      },
    });
  }

  public async markConnectionUpdatingIfErrored(connectionId: string): Promise<void> {
    await prisma.bankConnection.updateMany({
      where: {
        id: connectionId,
        status: 'erro',
      },
      data: {
        status: 'atualizando',
        lastError: null,
      },
    });
  }

  public async markConnectionRevoked(connectionId: string, lastError: string): Promise<void> {
    await prisma.bankConnection.updateMany({
      where: { id: connectionId },
      data: { status: 'revogada', lastError },
    });
  }

  public async markPendingTransactionsRemoved(
    connectionId: string,
    externalIds: ReadonlyArray<string>
  ): Promise<number> {
    const res = await prisma.bankTransaction.updateMany({
      where: {
        connectionId,
        provider: 'pluggy',
        externalId: { in: [...externalIds] },
        status: { in: ['nova', 'casada'] },
      },
      data: { status: 'removida' },
    });
    return res.count;
  }
}
