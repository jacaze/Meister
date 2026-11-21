import { afterEach, describe, expect, it } from 'vitest';
import { PluggyClient } from '../infra/PluggyClient.js';
import { ExternalServiceError } from '../../../shared/index.js';

// /v2/transactions pagina por cursor: `next` é a query string da próxima página ou null.
const originalFetch = globalThis.fetch;

function fakeTransactionsApi(totalPages: number | 'infinite') {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.pathname === '/auth') {
      return { ok: true, status: 200, json: async () => ({ apiKey: 'k' }) } as unknown as Response;
    }
    requested.push(u.search);
    const page = Number(u.searchParams.get('after') ?? '1');
    const hasNext = totalPages === 'infinite' || page < totalPages;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ id: `tx-${page}`, description: `Página ${page}`, amount: 10, date: '2026-11-04', type: 'CREDIT' }],
        next: hasNext ? `?accountId=acc-1&after=${page + 1}` : null,
      }),
    } as unknown as Response;
  }) as typeof fetch;
  return requested;
}

function client(maxPages?: number) {
  return new PluggyClient({ clientId: 'id', clientSecret: 'secret', baseUrl: 'https://pluggy.fake', maxPages });
}

describe('PluggyClient — paginação de transações', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('segue o cursor além de 10 páginas e devolve todas as transações', async () => {
    fakeTransactionsApi(12);

    const txs = await client().fetchTransactions('acc-1');

    expect(txs.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `tx-${i + 1}`));
  });

  it('lança erro ao atingir o teto de páginas em vez de devolver lista parcial', async () => {
    const requested = fakeTransactionsApi('infinite');

    await expect(client(3).fetchTransactions('acc-1')).rejects.toBeInstanceOf(ExternalServiceError);
    expect(requested).toHaveLength(3);
  });

  it('não lança quando a última página coincide com o teto', async () => {
    fakeTransactionsApi(3);

    expect(await client(3).fetchTransactions('acc-1')).toHaveLength(3);
  });
});
