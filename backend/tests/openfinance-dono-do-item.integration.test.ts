import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Tarefa 01: POST /api/openfinance/connect-item só pode importar um item da Pluggy
// cujo clientUserId seja o usuário autenticado. A API da Pluggy é simulada via fetch.

interface FakeItem {
  readonly id: string;
  readonly clientUserId?: string;
}

describe('OpenFinance — dono do item da Pluggy (anti-IDOR)', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  const fakeItems = new Map<string, FakeItem>();
  const originalFetch = globalThis.fetch;
  const prevId = process.env.PLUGGY_CLIENT_ID;
  const prevSecret = process.env.PLUGGY_CLIENT_SECRET;
  const prevBase = process.env.PLUGGY_BASE_URL;

  let tokenA = '';
  let tokenB = '';
  let userIdA = '';
  let userIdB = '';

  async function registerAndLogin(name: string, email: string) {
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name, email, password: 'Password123!', accountType: 'mei' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: login.json().token as string, userId: user.id };
  }

  function json(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }

  function fakePluggyFetch(url: string | URL | Request): Promise<Response> {
    const u = new URL(String(url));
    if (u.pathname === '/auth') return Promise.resolve(json({ apiKey: 'fake-api-key' }));

    const itemMatch = u.pathname.match(/^\/items\/([^/]+)$/);
    if (itemMatch) {
      const item = fakeItems.get(decodeURIComponent(itemMatch[1]!));
      if (!item) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ message: 'Item not found' }),
        } as unknown as Response);
      }
      return Promise.resolve(
        json({
          id: item.id,
          status: 'UPDATED',
          clientUserId: item.clientUserId,
          connector: { id: 1, name: 'Banco Simulado' },
          createdAt: '2026-11-01T00:00:00.000Z',
        })
      );
    }

    if (u.pathname === '/accounts') {
      const itemId = u.searchParams.get('itemId')!;
      return Promise.resolve(
        json({ results: [{ id: `acc-${itemId}`, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta' }] })
      );
    }

    if (u.pathname === '/v2/transactions') {
      const accountId = u.searchParams.get('accountId')!;
      return Promise.resolve(
        json({
          results: [
            {
              id: `tx-${accountId}`,
              description: 'PIX RECEBIDO',
              amount: 100,
              date: new Date().toISOString().slice(0, 10),
              type: 'CREDIT',
            },
          ],
          next: null,
        })
      );
    }

    if (/^\/items\/[^/]+\/sync$/.test(u.pathname)) return Promise.resolve(json({ status: 'UPDATING' }));

    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: async () => null } as unknown as Response);
  }

  async function countRowsForItem(itemId: string) {
    const connections = await prisma.bankConnection.count({ where: { provider: 'pluggy', itemId } });
    const accounts = await prisma.bankAccount.count({ where: { externalId: `acc-${itemId}` } });
    const transactions = await prisma.bankTransaction.count({
      where: { provider: 'pluggy', externalId: `tx-acc-${itemId}` },
    });
    return { connections, accounts, transactions };
  }

  function connect(token: string, itemId: string) {
    return app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId },
    });
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const a = await registerAndLogin('Ana Dona', `dono_a_${runId}@test.com`);
    const b = await registerAndLogin('Bruno Vitima', `dono_b_${runId}@test.com`);
    tokenA = a.token;
    userIdA = a.userId;
    tokenB = b.token;
    userIdB = b.userId;
  });

  beforeEach(() => {
    process.env.PLUGGY_CLIENT_ID = 'fake-client-id';
    process.env.PLUGGY_CLIENT_SECRET = 'fake-client-secret';
    process.env.PLUGGY_BASE_URL = 'https://pluggy.fake';
    globalThis.fetch = fakePluggyFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, prev] of [
      ['PLUGGY_CLIENT_ID', prevId],
      ['PLUGGY_CLIENT_SECRET', prevSecret],
      ['PLUGGY_BASE_URL', prevBase],
    ] as const) {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('recusa com 404 o item de outro usuário e não grava nada', async () => {
    const itemId = `item-de-b-${runId}`;
    fakeItems.set(itemId, { id: itemId, clientUserId: userIdB });

    const res = await connect(tokenA, itemId);

    expect(res.statusCode).toBe(404);
    expect(await countRowsForItem(itemId)).toEqual({ connections: 0, accounts: 0, transactions: 0 });
  });

  it('recusa com 404 o item sem clientUserId e não grava nada', async () => {
    const itemId = `item-sem-dono-${runId}`;
    fakeItems.set(itemId, { id: itemId });

    const res = await connect(tokenA, itemId);

    expect(res.statusCode).toBe(404);
    expect(await countRowsForItem(itemId)).toEqual({ connections: 0, accounts: 0, transactions: 0 });
  });

  it('responde 404 também para item inexistente na Pluggy', async () => {
    const res = await connect(tokenA, `item-inexistente-${runId}`);

    expect(res.statusCode).toBe(404);
  });

  it('importa normalmente o item do próprio usuário', async () => {
    const itemId = `item-de-a-${runId}`;
    fakeItems.set(itemId, { id: itemId, clientUserId: userIdA });

    const res = await connect(tokenA, itemId);

    expect(res.statusCode).toBe(201);
    expect(res.json().importedTransactionsCount).toBe(1);
    expect(await countRowsForItem(itemId)).toEqual({ connections: 1, accounts: 1, transactions: 1 });
  });

  it('a sincronização de uma conexão já existente no workspace continua funcionando', async () => {
    const itemId = `item-sync-a-${runId}`;
    fakeItems.set(itemId, { id: itemId, clientUserId: userIdA });
    const created = await connect(tokenA, itemId);
    expect(created.statusCode).toBe(201);

    const sync = await app.inject({
      method: 'POST',
      url: `/api/openfinance/connections/${created.json().connectionId}/sync`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(sync.statusCode).toBe(200);
    expect(sync.json().duplicatesSkippedCount).toBe(1);
  });

  it('recusa com 404 um item que já está conectado no workspace de outro usuário', async () => {
    const itemId = `item-ja-em-b-${runId}`;
    fakeItems.set(itemId, { id: itemId, clientUserId: userIdB });
    expect((await connect(tokenB, itemId)).statusCode).toBe(201);

    const res = await connect(tokenA, itemId);

    expect(res.statusCode).toBe(404);
    expect((await countRowsForItem(itemId)).connections).toBe(1);
  });
});
