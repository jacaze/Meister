import { afterEach, describe, expect, it } from 'vitest';
import { PluggyClient } from '../infra/PluggyClient.js';

// A Pluggy só grava o clientUserId no item se ele vier em `options` (POST /connect_token).
// Sem isso o item nasce sem dono e connect-item o recusa com 404.
const originalFetch = globalThis.fetch;

describe('PluggyClient.createConnectToken', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('envia o clientUserId dentro de options', async () => {
    let tokenBody: unknown;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/auth')) {
        return { ok: true, status: 200, json: async () => ({ apiKey: 'k' }) } as unknown as Response;
      }
      tokenBody = JSON.parse(String(init?.body));
      return { ok: true, status: 200, json: async () => ({ accessToken: 'connect-token' }) } as unknown as Response;
    }) as typeof fetch;

    const client = new PluggyClient({ clientId: 'id', clientSecret: 'secret', baseUrl: 'https://pluggy.fake' });
    const token = await client.createConnectToken({ clientUserId: 'user-123' });

    expect(token).toBe('connect-token');
    expect(tokenBody).toEqual({ options: { clientUserId: 'user-123' } });
  });
});
