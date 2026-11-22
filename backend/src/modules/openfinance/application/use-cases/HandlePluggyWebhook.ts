import {
  classifyPluggyWebhookEvent,
  mapPluggyWebhookErrorMessage,
  parseOptionalConsentExpiresAt,
} from '../../domain/pluggy-webhook-policy.js';
import type { PluggyWebhookGateway } from '../ports/PluggyWebhookGateway.js';
import type { PluggyWebhookPayload } from '../schemas/pluggy-webhook-schema.js';

export type HandlePluggyWebhookResult =
  | { readonly outcome: 'ignored_event' }
  | { readonly outcome: 'ignored_unknown_item' }
  | { readonly outcome: 'ignored_revoked'; readonly connectionId: string }
  | { readonly outcome: 'synced'; readonly connectionId: string }
  | { readonly outcome: 'marked_error'; readonly connectionId: string }
  | { readonly outcome: 'marked_updating'; readonly connectionId: string }
  | { readonly outcome: 'marked_revoked'; readonly connectionId: string }
  | {
      readonly outcome: 'transactions_removed';
      readonly connectionId: string;
      readonly removedCount: number;
    };

export interface HandlePluggyWebhookDependencies {
  readonly gateway: PluggyWebhookGateway;
}

/**
 * Processes an authenticated, schema-validated Pluggy webhook notification idempotently.
 */
export async function handlePluggyWebhook(
  payload: PluggyWebhookPayload,
  deps: HandlePluggyWebhookDependencies
): Promise<HandlePluggyWebhookResult> {
  const action = classifyPluggyWebhookEvent(payload.event);
  if (action === 'ignore') {
    return { outcome: 'ignored_event' };
  }

  const itemId = payload.itemId;
  if (!itemId) {
    return { outcome: 'ignored_unknown_item' };
  }

  const connection = await deps.gateway.findConnectionByItemId(itemId);
  if (!connection) {
    return { outcome: 'ignored_unknown_item' };
  }

  // Conexões revogadas são estado terminal e nunca devem ser reativadas por eventos atrasados
  if (connection.status === 'revogada') {
    return { outcome: 'ignored_revoked', connectionId: connection.id };
  }

  switch (action) {
    case 'sync': {
      await deps.gateway.syncConnectionFromWebhook(connection);
      return { outcome: 'synced', connectionId: connection.id };
    }
    case 'mark_error': {
      const consentExpiresAt = parseOptionalConsentExpiresAt(
        payload.consentExpiresAt ??
          payload.item?.consentExpiresAt ??
          payload.data?.consentExpiresAt
      );
      const lastError = mapPluggyWebhookErrorMessage(
        payload.event,
        payload.error?.code ?? undefined
      );
      await deps.gateway.markConnectionError(connection.id, {
        lastError,
        consentExpiresAt,
      });
      return { outcome: 'marked_error', connectionId: connection.id };
    }
    case 'mark_updating': {
      await deps.gateway.markConnectionUpdatingIfErrored(connection.id);
      return { outcome: 'marked_updating', connectionId: connection.id };
    }
    case 'mark_revoked': {
      await deps.gateway.markConnectionRevoked(
        connection.id,
        'Conexão bancária removida ou revogada na Pluggy.'
      );
      return { outcome: 'marked_revoked', connectionId: connection.id };
    }
    case 'delete_transactions': {
      const uniqueIds = Array.from(new Set(payload.transactionIds ?? []));
      if (uniqueIds.length === 0) {
        return {
          outcome: 'transactions_removed',
          connectionId: connection.id,
          removedCount: 0,
        };
      }
      const removedCount = await deps.gateway.markPendingTransactionsRemoved(
        connection.id,
        uniqueIds
      );
      return {
        outcome: 'transactions_removed',
        connectionId: connection.id,
        removedCount,
      };
    }
  }
}
