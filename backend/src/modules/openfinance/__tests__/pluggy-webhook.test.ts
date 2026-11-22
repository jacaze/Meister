import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  classifyPluggyWebhookEvent,
  extractBearerToken,
  mapPluggyWebhookErrorMessage,
  parseOptionalConsentExpiresAt,
  parsePluggySignatureHeader,
  PLUGGY_SIGNATURE_TOLERANCE_SECONDS,
  PLUGGY_SIGNING_SECRET_PREFIX,
  verifyPluggySignature,
  verifyPluggyWebhookAuth,
} from '../domain/pluggy-webhook-policy.js';
import { pluggyWebhookPayloadSchema } from '../application/schemas/pluggy-webhook-schema.js';
import { handlePluggyWebhook } from '../application/use-cases/HandlePluggyWebhook.js';
import type {
  PluggyWebhookConnectionRecord,
  PluggyWebhookGateway,
} from '../application/ports/PluggyWebhookGateway.js';
import { InMemoryPluggyWebhookDispatcher } from '../infra/InMemoryPluggyWebhookDispatcher.js';
import { verifyInternalSecret } from '../../scheduler/public.js';

function sign(rawBody: string, secret: string, tsSeconds: number): string {
  const hex = createHmac('sha256', secret)
    .update(`${tsSeconds}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${tsSeconds},v1=${hex}`;
}

describe('OpenFinance — pluggy-webhook-policy (domínio)', () => {
  const secret = 'whsec_' + '0123456789abcdef'.repeat(4);
  const rawBody = '{"event":"item/updated","itemId":"item-1"}';
  const nowSec = 1_795_000_000;
  const nowMs = nowSec * 1000;

  it('constantes de domínio mantêm valores contratuais esperados', () => {
    expect(PLUGGY_SIGNATURE_TOLERANCE_SECONDS).toBe(300);
    expect(PLUGGY_SIGNING_SECRET_PREFIX).toBe('whsec_');
  });

  describe('parsePluggySignatureHeader', () => {
    it('rejeita header vazio, espaços, segmento vazio, sem "=", t duplicado, não-numérico, zero/unsafe, sem v1 ou v1 inválido', () => {
      const validHex = 'a'.repeat(64);
      expect(parsePluggySignatureHeader('')).toBeNull();
      expect(parsePluggySignatureHeader('   ')).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,malformed,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`=10,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,t=11,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=abc,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=-5,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=0,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=99999999999999999999,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader('t=10')).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,v1=${'a'.repeat(63)}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,v1=${'a'.repeat(65)}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,v1=z${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=10,v1=${'g'.repeat(64)}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=123abc,v1=${validHex}`)).toBeNull();
      expect(parsePluggySignatureHeader(`t=abc123,v1=${validHex}`)).toBeNull();
    });

    it('aceita múltiplos v1, espaços, chaves extras de versão e normaliza hex para minúsculo', () => {
      const upperHex = 'A'.repeat(64);
      const secondHex = 'b'.repeat(64);
      expect(
        parsePluggySignatureHeader(` t = 1795000000 , v2=ignored , v1 = ${upperHex} , v1=${secondHex} `)
      ).toEqual({
        timestamp: 1795000000,
        signatures: ['a'.repeat(64), secondHex],
      });
    });
  });

  describe('verifyPluggySignature', () => {
    it('rejeita segredo vazio/espaços, header ausente/array, tolerância inválida, janela excedida e assinatura adulterada', () => {
      const validSig = sign(rawBody, secret, nowSec);
      expect(verifyPluggySignature({ signatureHeader: validSig, rawBody, secret: '  ', nowMs })).toBe(false);
      expect(verifyPluggySignature({ signatureHeader: undefined, rawBody, secret, nowMs })).toBe(false);
      expect(verifyPluggySignature({ signatureHeader: [validSig], rawBody, secret, nowMs })).toBe(false);
      expect(
        verifyPluggySignature({
          signatureHeader: validSig,
          rawBody,
          secret,
          nowMs,
          toleranceSeconds: -1,
        })
      ).toBe(false);
      expect(
        verifyPluggySignature({
          signatureHeader: validSig,
          rawBody,
          secret,
          nowMs,
          toleranceSeconds: Number.NaN,
        })
      ).toBe(false);
      expect(
        verifyPluggySignature({
          signatureHeader: validSig,
          rawBody,
          secret,
          nowMs,
          toleranceSeconds: Number.POSITIVE_INFINITY,
        })
      ).toBe(false);
      expect(verifyPluggySignature({ signatureHeader: 'invalid', rawBody, secret, nowMs })).toBe(false);

      // Fronteira exata ±300s e ±301s
      expect(
        verifyPluggySignature({
          signatureHeader: sign(rawBody, secret, nowSec - 300),
          rawBody,
          secret,
          nowMs,
        })
      ).toBe(true);
      expect(
        verifyPluggySignature({
          signatureHeader: sign(rawBody, secret, nowSec + 300),
          rawBody,
          secret,
          nowMs,
        })
      ).toBe(true);
      expect(
        verifyPluggySignature({
          signatureHeader: sign(rawBody, secret, nowSec - 301),
          rawBody,
          secret,
          nowMs,
        })
      ).toBe(false);
      expect(
        verifyPluggySignature({
          signatureHeader: sign(rawBody, secret, nowSec + 301),
          rawBody,
          secret,
          nowMs,
        })
      ).toBe(false);

      // toleranceSeconds = 0 exige segundo exato
      expect(
        verifyPluggySignature({
          signatureHeader: sign(rawBody, secret, nowSec),
          rawBody,
          secret,
          nowMs: nowMs + 999,
          toleranceSeconds: 0,
        })
      ).toBe(true);
      expect(
        verifyPluggySignature({
          signatureHeader: sign(rawBody, secret, nowSec - 1),
          rawBody,
          secret,
          nowMs,
          toleranceSeconds: 0,
        })
      ).toBe(false);

      // Corpo adulterado
      expect(
        verifyPluggySignature({
          signatureHeader: validSig,
          rawBody: '{"event":"item/deleted","itemId":"item-1"}',
          secret,
          nowMs,
        })
      ).toBe(false);
    });

    it('aceita quando um dos múltiplos v1 coincide e apara espaços do segredo configurado', () => {
      const secondHex = createHmac('sha256', secret)
        .update(`${nowSec}.${rawBody}`, 'utf8')
        .digest('hex');
      const header = `t=${nowSec},v1=${'f'.repeat(64)},v1=${secondHex}`;
      expect(
        verifyPluggySignature({
          signatureHeader: header,
          rawBody,
          secret: `  ${secret}  `,
          nowMs,
        })
      ).toBe(true);
    });
  });

  describe('extractBearerToken', () => {
    it('extrai Bearer de forma case-insensitive e retorna undefined em valores inválidos', () => {
      expect(extractBearerToken(undefined)).toBeUndefined();
      expect(extractBearerToken(['Bearer abc'])).toBeUndefined();
      expect(extractBearerToken('Basic abc123')).toBeUndefined();
      expect(extractBearerToken('Bearer')).toBeUndefined();
      expect(extractBearerToken('Bearer    ')).toBeUndefined();
      expect(extractBearerToken('Token Bearer tok_123')).toBeUndefined();
      expect(extractBearerToken('bearer my-token-value')).toBe('my-token-value');
      expect(extractBearerToken('  BEARER   tok_123  ')).toBe('tok_123');
    });
  });

  describe('verifyPluggyWebhookAuth', () => {
    const staticSecret = 'static_secret_minimum_32_characters_value';

    it('retorna disabled quando segredo está vazio ou só espaços (sem invocar verificador estático)', () => {
      let called = false;
      const stubVerifier = () => {
        called = true;
        return 'authorized' as const;
      };
      expect(
        verifyPluggyWebhookAuth({
          headers: { webhookSecret: 'anything' },
          rawBody,
          configuredSecret: '',
          nowMs,
          verifyStaticSecret: stubVerifier,
        })
      ).toBe('disabled');
      expect(
        verifyPluggyWebhookAuth({
          headers: { webhookSecret: 'anything' },
          rawBody,
          configuredSecret: '   ',
          nowMs,
          verifyStaticSecret: stubVerifier,
        })
      ).toBe('disabled');
      expect(called).toBe(false);
    });

    it('quando configurado como whsec_ exige HMAC e recusa cabeçalhos estáticos', () => {
      expect(
        verifyPluggyWebhookAuth({
          headers: {
            webhookSecret: secret,
            pluggyWebhookSecret: secret,
            authorization: `Bearer ${secret}`,
          },
          rawBody,
          configuredSecret: secret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('unauthorized');

      expect(
        verifyPluggyWebhookAuth({
          headers: { signature: sign(rawBody, secret, nowSec) },
          rawBody,
          configuredSecret: secret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('authorized');
    });

    it('quando X-Pluggy-Signature está presente com segredo não-whsec_, exige HMAC válido sem fallback', () => {
      expect(
        verifyPluggyWebhookAuth({
          headers: {
            signature: `t=${nowSec},v1=${'0'.repeat(64)}`,
            webhookSecret: staticSecret,
          },
          rawBody,
          configuredSecret: staticSecret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('unauthorized');

      expect(
        verifyPluggyWebhookAuth({
          headers: { signature: sign(rawBody, staticSecret, nowSec) },
          rawBody,
          configuredSecret: staticSecret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('authorized');
    });

    it('com segredo estático respeita precedência e rejeita ausência ou segredo incorreto', () => {
      expect(
        verifyPluggyWebhookAuth({
          headers: {},
          rawBody,
          configuredSecret: staticSecret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('unauthorized');

      expect(
        verifyPluggyWebhookAuth({
          headers: { webhookSecret: 'wrong', authorization: `Bearer ${staticSecret}` },
          rawBody,
          configuredSecret: staticSecret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('unauthorized');

      expect(
        verifyPluggyWebhookAuth({
          headers: { pluggyWebhookSecret: staticSecret },
          rawBody,
          configuredSecret: staticSecret,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('authorized');

      expect(
        verifyPluggyWebhookAuth({
          headers: { authorization: `Bearer ${staticSecret}` },
          rawBody,
          configuredSecret: `  ${staticSecret}  `,
          nowMs,
          verifyStaticSecret: verifyInternalSecret,
        })
      ).toBe('authorized');
    });
  });

  describe('classifyPluggyWebhookEvent & mapPluggyWebhookErrorMessage & parseOptionalConsentExpiresAt', () => {
    it('classifica corretamente todos os eventos suportados e ignora informativos/desconhecidos', () => {
      expect(classifyPluggyWebhookEvent('item/updated')).toBe('sync');
      expect(classifyPluggyWebhookEvent('item/created')).toBe('sync');
      expect(classifyPluggyWebhookEvent('transactions/created')).toBe('sync');
      expect(classifyPluggyWebhookEvent('transactions/updated')).toBe('sync');
      expect(classifyPluggyWebhookEvent('item/error')).toBe('mark_error');
      expect(classifyPluggyWebhookEvent('item/waiting_user_input')).toBe('mark_error');
      expect(classifyPluggyWebhookEvent('item/login_succeeded')).toBe('mark_updating');
      expect(classifyPluggyWebhookEvent('item/deleted')).toBe('mark_revoked');
      expect(classifyPluggyWebhookEvent('transactions/deleted')).toBe('delete_transactions');
      expect(classifyPluggyWebhookEvent('connector/status_updated')).toBe('ignore');
      expect(classifyPluggyWebhookEvent('custom/unknown')).toBe('ignore');
    });

    it('mapeia mensagens genéricas por evento e código sem refletir strings externas', () => {
      expect(mapPluggyWebhookErrorMessage('item/waiting_user_input')).toContain('confirmação adicional');
      expect(mapPluggyWebhookErrorMessage('item/error', ' invalid_credentials ')).toContain('Credenciais');
      expect(mapPluggyWebhookErrorMessage('item/error', 'USER_AUTHORIZATION_NOT_GRANTED')).toContain(
        'Credenciais'
      );
      expect(mapPluggyWebhookErrorMessage('item/error', 'USER_AUTHORIZATION_REVOKED')).toContain(
        'Consentimento'
      );
      expect(mapPluggyWebhookErrorMessage('item/error', 'CONSENT_EXPIRED')).toContain('Consentimento');
      expect(mapPluggyWebhookErrorMessage('item/error', 'USER_INPUT_TIMEOUT')).toContain('Tempo esgotado');
      expect(mapPluggyWebhookErrorMessage('item/error', 'ACCOUNT_NEEDS_ACTION')).toContain('ação do titular');
      expect(mapPluggyWebhookErrorMessage('item/error', 'WAITING_USER_INPUT')).toContain('ação do titular');
      expect(mapPluggyWebhookErrorMessage('item/error', 'SITE_NOT_AVAILABLE')).toContain('indisponível');
      expect(mapPluggyWebhookErrorMessage('item/error', 'CONNECTION_ERROR')).toContain('indisponível');
      expect(mapPluggyWebhookErrorMessage('item/error', 'SOMETHING_ELSE')).toContain('requer atenção');
      expect(mapPluggyWebhookErrorMessage('item/error')).toContain('requer atenção');
    });

    it('converte consentExpiresAt apenas quando ISO válido não vazio', () => {
      expect(parseOptionalConsentExpiresAt(undefined)).toBeUndefined();
      expect(parseOptionalConsentExpiresAt(null)).toBeUndefined();
      expect(parseOptionalConsentExpiresAt('   ')).toBeUndefined();
      expect(parseOptionalConsentExpiresAt('not-a-date')).toBeUndefined();
      expect(parseOptionalConsentExpiresAt(' 2026-12-31T23:59:59-03:00 ')?.toISOString()).toBe(
        '2027-01-01T02:59:59.000Z'
      );
    });
  });
});

describe('OpenFinance — pluggyWebhookPayloadSchema', () => {
  it('aceita payloads completos válidos incluindo passthrough e campos opcionais', () => {
    const ok = pluggyWebhookPayloadSchema.safeParse({
      event: 'item/error',
      eventId: 'evt-1',
      clientId: 'client-1',
      triggeredBy: 'SYNC',
      itemId: 'item-1',
      accountId: 'acc-1',
      consentExpiresAt: '2026-12-31T23:59:59.000Z',
      error: { code: 'CONNECTION_ERROR', message: 'timeout', extraProp: 1 },
      item: { consentExpiresAt: null },
      data: { consentExpiresAt: '2026-12-31T20:00:00-03:00' },
      unmappedRootField: 'ok',
    });
    expect(ok.success).toBe(true);

    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'transactions/deleted',
        itemId: 'item-1',
        transactionIds: [],
      }).success
    ).toBe(true);

    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'connector/status_updated',
      }).success
    ).toBe(true);

    // Pluggy pode enviar propriedades opcionais nulas ou error.message longo em webhooks reais
    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'connector/status_updated',
        eventId: null,
        clientId: null,
        triggeredBy: null,
        itemId: null,
        accountId: null,
        transactionIds: null,
        error: { code: null, message: null },
      }).success
    ).toBe(true);

    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'item/error',
        itemId: 'item-1',
        error: { code: 'CONNECTION_ERROR', message: 'm'.repeat(3000) },
      }).success
    ).toBe(true);
  });

  it('rejeita violações de esquema, tamanhos máximos e campos condicionais obrigatórios', () => {
    expect(pluggyWebhookPayloadSchema.safeParse({}).success).toBe(false);
    expect(pluggyWebhookPayloadSchema.safeParse({ event: '' }).success).toBe(false);
    expect(pluggyWebhookPayloadSchema.safeParse({ event: '   ' }).success).toBe(false);
    expect(pluggyWebhookPayloadSchema.safeParse({ event: 'a'.repeat(121) }).success).toBe(false);

    const missingItemId = pluggyWebhookPayloadSchema.safeParse({ event: 'item/updated' });
    expect(missingItemId.success).toBe(false);
    if (!missingItemId.success) {
      expect(missingItemId.error.issues[0]?.path).toEqual(['itemId']);
      expect(missingItemId.error.issues[0]?.message).toContain('itemId');
    }

    expect(pluggyWebhookPayloadSchema.safeParse({ event: 'item/updated', itemId: null }).success).toBe(false);
    expect(
      pluggyWebhookPayloadSchema.safeParse({ event: 'item/updated', itemId: '   ' }).success
    ).toBe(false);
    expect(
      pluggyWebhookPayloadSchema.safeParse({ event: 'item/updated', itemId: 'x'.repeat(256) }).success
    ).toBe(false);

    const missingTxIds = pluggyWebhookPayloadSchema.safeParse({
      event: 'transactions/deleted',
      itemId: 'item-1',
    });
    expect(missingTxIds.success).toBe(false);
    if (!missingTxIds.success) {
      expect(missingTxIds.error.issues[0]?.path).toEqual(['transactionIds']);
      expect(missingTxIds.error.issues[0]?.message).toContain('transactionIds');
    }
    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'transactions/deleted',
        itemId: 'item-1',
        transactionIds: null,
      }).success
    ).toBe(false);

    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'transactions/deleted',
        itemId: 'item-1',
        transactionIds: ['  '],
      }).success
    ).toBe(false);
    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'transactions/deleted',
        itemId: 'item-1',
        transactionIds: ['t'.repeat(256)],
      }).success
    ).toBe(false);
    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'transactions/deleted',
        itemId: 'item-1',
        transactionIds: Array.from({ length: 1001 }, (_, i) => `tx-${i}`),
      }).success
    ).toBe(false);
    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'item/error',
        itemId: 'item-1',
        error: { code: 'ERR', message: 'm'.repeat(4001) },
      }).success
    ).toBe(false);
    expect(
      pluggyWebhookPayloadSchema.safeParse({
        event: 'item/error',
        itemId: 'item-1',
        consentExpiresAt: '2026-12-31',
      }).success
    ).toBe(false);
  });
});

describe('OpenFinance — handlePluggyWebhook (application)', () => {
  function createMockGateway(record: PluggyWebhookConnectionRecord | null) {
    const calls: string[] = [];
    let lastErrorArg: { connectionId: string; lastError: string; consentExpiresAt?: Date } | null = null;
    let revokedLastError: string | null = null;
    let deletedIds: ReadonlyArray<string> | null = null;

    const gateway: PluggyWebhookGateway = {
      async findConnectionByItemId(itemId) {
        calls.push(`find:${itemId}`);
        return record;
      },
      async syncConnectionFromWebhook(conn) {
        calls.push(`sync:${conn.id}`);
      },
      async markConnectionError(connectionId, input) {
        calls.push(`error:${connectionId}`);
        lastErrorArg = { connectionId, ...input };
      },
      async markConnectionUpdatingIfErrored(connectionId) {
        calls.push(`updating:${connectionId}`);
      },
      async markConnectionRevoked(connectionId, lastError) {
        calls.push(`revoked:${connectionId}`);
        revokedLastError = lastError;
      },
      async markPendingTransactionsRemoved(connectionId, externalIds) {
        calls.push(`delete_tx:${connectionId}`);
        deletedIds = externalIds;
        return externalIds.length;
      },
    };

    return {
      gateway,
      calls,
      getLastErrorArg: () => lastErrorArg,
      getRevokedLastError: () => revokedLastError,
      getDeletedIds: () => deletedIds,
    };
  }

  const activeConnection: PluggyWebhookConnectionRecord = {
    id: 'conn-1',
    workspaceId: 'ws-1',
    status: 'ativa',
    entities: [{ id: 'pf-1', kind: 'pf', isMei: false, active: true }],
  };

  it('retorna outcomes corretos para evento ignorado, itemId ausente defensivo, item desconhecido e conexão revogada', async () => {
    const mock = createMockGateway(activeConnection);
    expect(
      await handlePluggyWebhook({ event: 'connector/status_updated' }, { gateway: mock.gateway })
    ).toEqual({ outcome: 'ignored_event' });
    expect(mock.calls).toEqual([]);

    expect(
      await handlePluggyWebhook({ event: 'item/updated' }, { gateway: mock.gateway })
    ).toEqual({ outcome: 'ignored_unknown_item' });
    expect(mock.calls).toEqual([]);

    const missingMock = createMockGateway(null);
    expect(
      await handlePluggyWebhook({ event: 'item/updated', itemId: 'x' }, { gateway: missingMock.gateway })
    ).toEqual({ outcome: 'ignored_unknown_item' });
    expect(missingMock.calls).toEqual(['find:x']);

    const revokedMock = createMockGateway({ ...activeConnection, status: 'revogada' });
    expect(
      await handlePluggyWebhook({ event: 'item/updated', itemId: 'x' }, { gateway: revokedMock.gateway })
    ).toEqual({ outcome: 'ignored_revoked', connectionId: 'conn-1' });
    expect(revokedMock.calls).toEqual(['find:x']);
  });

  it('executa sync, mark_error (fallback item/data consentExpiresAt), mark_updating, mark_revoked e delete_transactions deduplicado', async () => {
    const syncMock = createMockGateway(activeConnection);
    expect(
      await handlePluggyWebhook({ event: 'transactions/created', itemId: 'item-1' }, { gateway: syncMock.gateway })
    ).toEqual({ outcome: 'synced', connectionId: 'conn-1' });
    expect(syncMock.calls).toEqual(['find:item-1', 'sync:conn-1']);

    // consentExpiresAt em raiz, item ou data
    const errItemMock = createMockGateway(activeConnection);
    expect(
      await handlePluggyWebhook(
        {
          event: 'item/error',
          itemId: 'item-1',
          item: { consentExpiresAt: '2026-12-01T00:00:00.000Z' },
          error: { code: 'CONSENT_EXPIRED', message: 'secret detail' },
        },
        { gateway: errItemMock.gateway }
      )
    ).toEqual({ outcome: 'marked_error', connectionId: 'conn-1' });
    expect(errItemMock.getLastErrorArg()?.consentExpiresAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(errItemMock.getLastErrorArg()?.lastError).toContain('Consentimento');

    const errDataMock = createMockGateway(activeConnection);
    await handlePluggyWebhook(
      {
        event: 'item/waiting_user_input',
        itemId: 'item-1',
        data: { consentExpiresAt: '2026-12-05T00:00:00.000Z' },
      },
      { gateway: errDataMock.gateway }
    );
    expect(errDataMock.getLastErrorArg()?.consentExpiresAt?.toISOString()).toBe('2026-12-05T00:00:00.000Z');

    const errNoConsentMock = createMockGateway(activeConnection);
    await handlePluggyWebhook(
      {
        event: 'item/error',
        itemId: 'item-1',
      },
      { gateway: errNoConsentMock.gateway }
    );
    expect(errNoConsentMock.getLastErrorArg()?.consentExpiresAt).toBeUndefined();

    const updMock = createMockGateway({ ...activeConnection, status: 'erro' });
    expect(
      await handlePluggyWebhook({ event: 'item/login_succeeded', itemId: 'item-1' }, { gateway: updMock.gateway })
    ).toEqual({ outcome: 'marked_updating', connectionId: 'conn-1' });
    expect(updMock.calls).toEqual(['find:item-1', 'updating:conn-1']);

    const delConnMock = createMockGateway(activeConnection);
    expect(
      await handlePluggyWebhook({ event: 'item/deleted', itemId: 'item-1' }, { gateway: delConnMock.gateway })
    ).toEqual({ outcome: 'marked_revoked', connectionId: 'conn-1' });
    expect(delConnMock.getRevokedLastError()).toBe('Conexão bancária removida ou revogada na Pluggy.');

    const emptyDelTxMock = createMockGateway(activeConnection);
    expect(
      await handlePluggyWebhook(
        { event: 'transactions/deleted', itemId: 'item-1', transactionIds: [] },
        { gateway: emptyDelTxMock.gateway }
      )
    ).toEqual({ outcome: 'transactions_removed', connectionId: 'conn-1', removedCount: 0 });
    expect(
      await handlePluggyWebhook(
        { event: 'transactions/deleted', itemId: 'item-1' },
        { gateway: emptyDelTxMock.gateway }
      )
    ).toEqual({ outcome: 'transactions_removed', connectionId: 'conn-1', removedCount: 0 });
    expect(emptyDelTxMock.calls).toEqual(['find:item-1', 'find:item-1']);

    const delTxMock = createMockGateway(activeConnection);
    expect(
      await handlePluggyWebhook(
        { event: 'transactions/deleted', itemId: 'item-1', transactionIds: ['t1', 't2', 't1'] },
        { gateway: delTxMock.gateway }
      )
    ).toEqual({ outcome: 'transactions_removed', connectionId: 'conn-1', removedCount: 2 });
    expect(delTxMock.getDeletedIds()).toEqual(['t1', 't2']);
  });
});

describe('OpenFinance — InMemoryPluggyWebhookDispatcher (infra)', () => {
  it('serializa FIFO por chave, executa chaves distintas em paralelo, captura falhas sem quebrar a fila e drena completamente', async () => {
    const errors: unknown[] = [];
    const dispatcher = new InMemoryPluggyWebhookDispatcher((err) => errors.push(err));
    const events: string[] = [];

    let releaseA1!: () => void;
    const gateA1 = new Promise<void>((resolve) => {
      releaseA1 = resolve;
    });

    dispatcher.enqueue('item-A', async () => {
      events.push('A1-start');
      await gateA1;
      events.push('A1-end');
    });
    dispatcher.enqueue('item-A', async () => {
      events.push('A2-fail');
      throw new Error('job A2 exploded');
    });
    dispatcher.enqueue('item-A', async () => {
      events.push('A3-runs-after-fail');
    });
    dispatcher.enqueue('item-B', async () => {
      events.push('B1-parallel');
    });
    dispatcher.enqueue('   ', async () => {
      events.push('global-trimmed');
      // Job enfileirado dinamicamente durante o drain também deve ser aguardado
      dispatcher.enqueue('', async () => {
        events.push('global-chained');
      });
    });

    // B1 (ou global) consegue avançar enquanto A1 está preso no gateA1, e A2 ainda não iniciou
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toContain('A1-start');
    expect(events).toContain('B1-parallel');
    expect(events).not.toContain('A2-fail');

    releaseA1();
    await dispatcher.drain();

    expect(events).toEqual([
      'A1-start',
      'B1-parallel',
      'global-trimmed',
      'global-chained',
      'A1-end',
      'A2-fail',
      'A3-runs-after-fail',
    ]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('job A2 exploded');
  });

  it('normaliza chave com espaços na mesma fila, tolera falha sem callback onError e drain aguarda 2º job após 1º concluir', async () => {
    const dispatcher = new InMemoryPluggyWebhookDispatcher();
    const trace: string[] = [];

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    dispatcher.enqueue('same-key', async () => {
      trace.push('1-start');
      await firstGate;
      trace.push('1-end');
    });
    dispatcher.enqueue('  same-key  ', async () => {
      trace.push('2-start');
      await secondGate;
      trace.push('2-end');
    });
    dispatcher.enqueue('   ', async () => {
      throw new Error('erro sem onError');
    });

    // Solta o 1º job enquanto o 2º ainda está bloqueado: finally do 1º não pode apagar a entrada da fila no Map
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(trace).toEqual(['1-start', '1-end', '2-start']);

    let drainResolved = false;
    const draining = dispatcher.drain().then(() => {
      drainResolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drainResolved).toBe(false);

    releaseSecond();
    await draining;
    expect(drainResolved).toBe(true);
    expect(trace).toEqual(['1-start', '1-end', '2-start', '2-end']);
  });
});
