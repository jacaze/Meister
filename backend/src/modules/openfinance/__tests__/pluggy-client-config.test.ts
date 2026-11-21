import { afterEach, describe, expect, it } from 'vitest';
import { PluggyClient } from '../infra/PluggyClient.js';

// PluggyClient precisa ler a configuração do mesmo jeito que o env.ts a valida.
const originalFetch = globalThis.fetch;
const saved = {
  id: process.env.PLUGGY_CLIENT_ID,
  secret: process.env.PLUGGY_CLIENT_SECRET,
  base: process.env.PLUGGY_BASE_URL,
};

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function authUrlFor(baseUrl: string): Promise<string> {
  process.env.PLUGGY_CLIENT_ID = 'client-id';
  process.env.PLUGGY_CLIENT_SECRET = 'client-secret';
  process.env.PLUGGY_BASE_URL = baseUrl;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ apiKey: 'k' }) } as unknown as Response;
  }) as typeof fetch;
  await new PluggyClient().validateCredentials();
  return urls[0]!;
}

describe('PluggyClient — leitura da configuração', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restore('PLUGGY_CLIENT_ID', saved.id);
    restore('PLUGGY_CLIENT_SECRET', saved.secret);
    restore('PLUGGY_BASE_URL', saved.base);
  });

  it('remove a barra final de PLUGGY_BASE_URL', async () => {
    expect(await authUrlFor('https://api.pluggy.ai/')).toBe('https://api.pluggy.ai/auth');
  });

  it('PLUGGY_BASE_URL só com espaços usa a API oficial', async () => {
    expect(await authUrlFor('   ')).toBe('https://api.pluggy.ai/auth');
  });

  it('credenciais só com espaços contam como ausentes', async () => {
    process.env.PLUGGY_CLIENT_ID = '  ';
    process.env.PLUGGY_CLIENT_SECRET = '  ';
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({ apiKey: 'k' }) } as unknown as Response;
    }) as typeof fetch;

    const result = await new PluggyClient().validateCredentials();

    expect(result.valid).toBe(false);
    expect(called).toBe(false);
  });
});
