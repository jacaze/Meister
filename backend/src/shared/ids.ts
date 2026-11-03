import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generates a RFC 9562 UUID v7 (time-ordered UUID with 48-bit millisecond timestamp).
 */
export function newId(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Math.max(0, Math.trunc(nowMs)));

  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // Version 7 (0111)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Variant 10xx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generates a cryptographically strong random token encoded in base64url.
 */
export function newToken(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength < 16) {
    throw new Error('Token byteLength must be an integer >= 16');
  }
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Computes a SHA-256 hex digest (used for token hashes, email hashes in rate-limit keys, etc.).
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks on webhook secrets and tokens.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
