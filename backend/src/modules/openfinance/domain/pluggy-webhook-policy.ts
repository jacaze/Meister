import { createHmac } from 'node:crypto';
import { constantTimeEquals } from '../../../shared/index.js';

export const PLUGGY_SIGNATURE_TOLERANCE_SECONDS = 300;
export const PLUGGY_SIGNING_SECRET_PREFIX = 'whsec_';

export type PluggyWebhookAuthResult = 'disabled' | 'unauthorized' | 'authorized';

export type PluggyWebhookEventAction =
  | 'sync'
  | 'mark_error'
  | 'mark_updating'
  | 'mark_revoked'
  | 'delete_transactions'
  | 'ignore';

export type StaticSecretVerifier = (
  providedHeader: string | string[] | undefined,
  configuredSecret: string
) => PluggyWebhookAuthResult;

export interface ParsedPluggySignature {
  readonly timestamp: number;
  readonly signatures: ReadonlyArray<string>;
}

export interface VerifyPluggySignatureInput {
  readonly signatureHeader: string | string[] | undefined;
  readonly rawBody: string;
  readonly secret: string;
  readonly nowMs: number;
  readonly toleranceSeconds?: number;
}

export interface PluggyWebhookAuthHeaders {
  readonly signature?: string | string[];
  readonly webhookSecret?: string | string[];
  readonly pluggyWebhookSecret?: string | string[];
  readonly authorization?: string | string[];
}

export interface VerifyPluggyWebhookAuthInput {
  readonly headers: PluggyWebhookAuthHeaders;
  readonly rawBody: string;
  readonly configuredSecret: string;
  readonly nowMs: number;
  readonly verifyStaticSecret: StaticSecretVerifier;
  readonly toleranceSeconds?: number;
}

const HEX_SHA256_REGEX = /^[0-9a-f]{64}$/i;
const DIGITS_REGEX = /^\d+$/;
const BEARER_REGEX = /^Bearer\s+(\S[\s\S]*)$/i;

/**
 * Parses the `X-Pluggy-Signature` header (`t=<unix_seconds>,v1=<hex_hmac>`).
 * Returns null if timestamp is missing/duplicated/non-positive or no valid `v1` digest exists.
 */
export function parsePluggySignatureHeader(header: string): ParsedPluggySignature | null {
  const trimmed = header.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (part.length === 0) {
      return null;
    }

    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) {
      return null;
    }

    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();

    if (key === 't') {
      if (timestamp !== null || !DIGITS_REGEX.test(value)) {
        return null;
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return null;
      }
      timestamp = parsed;
    } else if (key === 'v1') {
      if (!HEX_SHA256_REGEX.test(value)) {
        return null;
      }
      signatures.push(value.toLowerCase());
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

/**
 * Verifies Pluggy's `X-Pluggy-Signature` HMAC-SHA256 header against `<t>.<rawBody>`
 * in constant time and enforces a replay-protection timestamp window (default ±5 min).
 */
export function verifyPluggySignature(input: VerifyPluggySignatureInput): boolean {
  const expectedSecret = input.secret.trim();
  if (expectedSecret.length === 0) {
    return false;
  }

  if (typeof input.signatureHeader !== 'string') {
    return false;
  }

  const tolerance = input.toleranceSeconds ?? PLUGGY_SIGNATURE_TOLERANCE_SECONDS;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return false;
  }

  const parsed = parsePluggySignatureHeader(input.signatureHeader);
  if (!parsed) {
    return false;
  }

  const nowSeconds = Math.floor(input.nowMs / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${input.rawBody}`;
  const expectedDigest = createHmac('sha256', expectedSecret)
    .update(signedPayload)
    .digest('hex');

  let matched = false;
  for (const candidate of parsed.signatures) {
    if (constantTimeEquals(candidate, expectedDigest)) {
      matched = true;
    }
  }
  return matched;
}

/**
 * Extracts a Bearer token from an Authorization header value, or returns undefined if malformed.
 */
export function extractBearerToken(
  authorizationHeader: string | string[] | undefined
): string | undefined {
  if (typeof authorizationHeader !== 'string') {
    return undefined;
  }
  const match = BEARER_REGEX.exec(authorizationHeader.trim());
  return match?.[1]?.trim() || undefined;
}

/**
 * Authenticates Pluggy webhook requests:
 * - Empty configured secret -> `'disabled'` (404)
 * - Signing secret starting with `whsec_` -> HMAC-SHA256 (`X-Pluggy-Signature`) mandatory, no fallback
 * - Request carrying `X-Pluggy-Signature` -> HMAC-SHA256 mandatory, no fallback
 * - Static shared secret -> verified in constant time via `verifyStaticSecret`
 */
export function verifyPluggyWebhookAuth(
  input: VerifyPluggyWebhookAuthInput
): PluggyWebhookAuthResult {
  const expected = input.configuredSecret.trim();
  if (expected.length === 0) {
    return 'disabled';
  }

  if (
    expected.startsWith(PLUGGY_SIGNING_SECRET_PREFIX) ||
    input.headers.signature !== undefined
  ) {
    return verifyPluggySignature({
      signatureHeader: input.headers.signature,
      rawBody: input.rawBody,
      secret: expected,
      nowMs: input.nowMs,
      toleranceSeconds: input.toleranceSeconds,
    })
      ? 'authorized'
      : 'unauthorized';
  }

  const staticCandidate =
    input.headers.webhookSecret ??
    input.headers.pluggyWebhookSecret ??
    extractBearerToken(input.headers.authorization);

  return input.verifyStaticSecret(staticCandidate, expected);
}

/**
 * Maps Pluggy webhook event names onto internal state-machine actions.
 */
export function classifyPluggyWebhookEvent(event: string): PluggyWebhookEventAction {
  switch (event) {
    case 'item/updated':
    case 'item/created':
    case 'transactions/created':
    case 'transactions/updated':
      return 'sync';
    case 'item/error':
    case 'item/waiting_user_input':
      return 'mark_error';
    case 'item/login_succeeded':
      return 'mark_updating';
    case 'item/deleted':
      return 'mark_revoked';
    case 'transactions/deleted':
      return 'delete_transactions';
    default:
      return 'ignore';
  }
}

/**
 * Maps Pluggy webhook error events/codes onto safe, generic Portuguese user-facing messages.
 * Never reflects untrusted raw `error.message` text from the webhook body.
 */
export function mapPluggyWebhookErrorMessage(event: string, errorCode?: string): string {
  if (event === 'item/waiting_user_input') {
    return 'A instituição financeira solicita confirmação adicional ou renovação de acesso.';
  }

  const normalizedCode = errorCode?.trim().toUpperCase();
  switch (normalizedCode) {
    case 'INVALID_CREDENTIALS':
    case 'USER_AUTHORIZATION_NOT_GRANTED':
      return 'Credenciais ou autorização bancária inválidas. Reconecte o banco para continuar.';
    case 'USER_AUTHORIZATION_REVOKED':
    case 'CONSENT_EXPIRED':
      return 'Consentimento Open Finance expirado ou revogado. Autorize novamente a conexão.';
    case 'USER_INPUT_TIMEOUT':
      return 'Tempo esgotado aguardando confirmação bancária. Tente sincronizar novamente.';
    case 'ACCOUNT_NEEDS_ACTION':
    case 'WAITING_USER_INPUT':
      return 'A instituição financeira requer ação do titular antes de continuar.';
    case 'SITE_NOT_AVAILABLE':
    case 'CONNECTION_ERROR':
      return 'Instituição financeira temporariamente indisponível na Pluggy. Nova tentativa automática será feita.';
    default:
      return 'Conexão bancária requer atenção na Pluggy. Verifique a conexão e sincronize novamente.';
  }
}

/**
 * Parses an optional ISO date string into a valid Date or returns undefined.
 */
export function parseOptionalConsentExpiresAt(raw?: string | null): Date | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}
