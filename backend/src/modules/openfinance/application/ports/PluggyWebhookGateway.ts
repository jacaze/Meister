export interface PluggyWebhookEntityRecord {
  readonly id: string;
  readonly kind: string;
  readonly isMei: boolean;
  readonly active: boolean;
}

export interface PluggyWebhookConnectionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: string;
  readonly entities: ReadonlyArray<PluggyWebhookEntityRecord>;
}

export interface MarkConnectionErrorInput {
  readonly lastError: string;
  readonly consentExpiresAt?: Date;
}

export interface PluggyWebhookGateway {
  findConnectionByItemId(itemId: string): Promise<PluggyWebhookConnectionRecord | null>;
  syncConnectionFromWebhook(connection: PluggyWebhookConnectionRecord): Promise<void>;
  markConnectionError(connectionId: string, input: MarkConnectionErrorInput): Promise<void>;
  markConnectionUpdatingIfErrored(connectionId: string): Promise<void>;
  markConnectionRevoked(connectionId: string, lastError: string): Promise<void>;
  markPendingTransactionsRemoved(
    connectionId: string,
    externalIds: ReadonlyArray<string>
  ): Promise<number>;
}
