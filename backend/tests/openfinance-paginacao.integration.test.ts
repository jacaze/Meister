import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Tarefa 06: importação que não completa (cursor da Pluggy sem fim) não pode gravar dados pela
// metade; a conexão fica com status 'erro' e volta a 'ativa' na próxima sincronização bem-sucedida.

describe('OpenFinance — importação incompleta da Pluggy', () => {
  let app: FastifyInstance;
  let token = '';
  let userId = '';
  const runId = Date.now();
  const itemId = `item-paginacao-${runId}`;
  const accounts = [`acc-ok-${runId}`, `acc-loop-${runId}`];
  let loopForever = true;
  const originalFetch = globalThis.fetch;
  const saved = {
    id: process.env.PLUGGY_CLIENT_ID,
    secret: process.env.PLUGGY_CLIENT_SECRET,
    base: process.env.PLUGGY_BASE_URL,
  };

  function json(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }

  async function fakePluggyFetch(url: string | URL | Request): Promise<Response> {
    const u = new URL(String(url));
    if (u.pathname === '/auth') return json({ apiKey: 'k' });
    if (u.pathname === `/items/${itemId}`) {
      return json({
        id: itemId,
        status: 'UPDATED',
        clientUserId: userId,
        connector: { id: 1, name: 'Banco Simulado' },
        createdAt: '2026-11-01T00:00:00.000Z',
      });
    }
    if (/^\/items\/[^/]+\/sync$/.test(u.pathname)) return json({ status: 'UPDATING' });
    if (u.pathname === '/accounts') {
      return json({ results: accounts.map((id) => ({ id, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: id })) });
    }
    if (u.pathname === '/v2/transactions') {
      const accountId = u.searchParams.get('accountId')!;
      const page = Number(u.searchParams.get('after') ?? '1');
      const hasNext = accountId.startsWith('acc-loop') && loopForever;
      return json({
        results: [
          {
            id: `tx-${accountId}-${page}`,
            description: 'PIX RECEBIDO',
            amount: 10,
            date: new Date().toISOString().slice(0, 10),
            type: 'CREDIT',
          },
        ],
        next: hasNext ? `?accountId=${accountId}&after=${page + 1}` : null,
      });
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => null } as unknown as Response;
  }

  async function importedCount() {
    return prisma.bankTransaction.count({
      where: { provider: 'pluggy', externalId: { startsWith: 'tx-acc-' }, connection: { itemId } },
    });
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const email = `paginacao_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Paula Paginada', email, password: 'Password123!', accountType: 'mei' },
    });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    token = login.json().token as string;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  });

  beforeEach(() => {
    process.env.PLUGGY_CLIENT_ID = 'fake-client-id';
    process.env.PLUGGY_CLIENT_SECRET = 'fake-client-secret';
    process.env.PLUGGY_BASE_URL = 'https://pluggy.fake';
    globalThis.fetch = fakePluggyFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ['PLUGGY_CLIENT_ID', saved.id],
      ['PLUGGY_CLIENT_SECRET', saved.secret],
      ['PLUGGY_BASE_URL', saved.base],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('não grava nada, marca a conexão com erro e se recupera na próxima sincronização', async () => {
    loopForever = true;
    const failed = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId },
    });

    expect(failed.statusCode).toBe(503);
    const broken = await prisma.bankConnection.findFirstOrThrow({ where: { provider: 'pluggy', itemId } });
    expect(broken.status).toBe('erro');
    expect(broken.lastError).toBeTruthy();
    expect(broken.lastSyncAt).toBeNull();
    expect(await importedCount()).toBe(0);

    loopForever = false;
    const sync = await app.inject({
      method: 'POST',
      url: `/api/openfinance/connections/${broken.id}/sync`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(sync.statusCode).toBe(200);
    const healed = await prisma.bankConnection.findUniqueOrThrow({ where: { id: broken.id } });
    expect(healed.status).toBe('ativa');
    expect(healed.lastError).toBeNull();
    expect(healed.lastSyncAt).not.toBeNull();
    expect(await importedCount()).toBe(2);
  });
});
