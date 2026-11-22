import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Tarefa 14: conta importada da Pluggy não pode cair na PJ por padrão. O usuário diz de qual entidade
// é cada conta, e a aprovação usa essa entidade.

interface User {
  token: string;
  userId: string;
  workspaceId: string;
  pf: string;
  pj?: string;
}

describe('OpenFinance — entidade de cada conta bancária', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  const originalFetch = globalThis.fetch;
  const saved = {
    id: process.env.PLUGGY_CLIENT_ID,
    secret: process.env.PLUGGY_CLIENT_SECRET,
    base: process.env.PLUGGY_BASE_URL,
  };
  const owners = new Map<string, string>();
  let mei: User;
  let pessoa: User;

  function json(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }

  async function fakePluggyFetch(url: string | URL | Request): Promise<Response> {
    const u = new URL(String(url));
    if (u.pathname === '/auth') return json({ apiKey: 'k' });
    const itemMatch = u.pathname.match(/^\/items\/([^/]+)$/);
    if (itemMatch) {
      const id = itemMatch[1]!;
      return json({
        id,
        status: 'UPDATED',
        clientUserId: owners.get(id),
        connector: { id: 1, name: 'Banco Simulado' },
        createdAt: '2026-11-01T00:00:00.000Z',
      });
    }
    if (/^\/items\/[^/]+\/sync$/.test(u.pathname)) return json({ status: 'UPDATING' });
    if (u.pathname === '/accounts') {
      const itemId = u.searchParams.get('itemId')!;
      return json({
        results: [
          { id: `${itemId}-cc`, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta Corrente' },
          { id: `${itemId}-cartao`, type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão' },
        ],
      });
    }
    if (u.pathname === '/v2/transactions') {
      const accountId = u.searchParams.get('accountId')!;
      return json({
        results: [
          {
            id: `tx-${accountId}`,
            description: 'COMPRA MERCADO',
            amount: -50,
            date: new Date().toISOString().slice(0, 10),
            type: 'DEBIT',
          },
        ],
        next: null,
      });
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => null } as unknown as Response;
  }

  async function signUp(label: string, accountType: 'mei' | 'pessoa_fisica'): Promise<User> {
    const email = `entidade_${label}_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: `Usuário ${label}`, email, password: 'Password123!', accountType },
    });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const token = login.json().token as string;
    const ws = await app.inject({ method: 'GET', url: '/api/workspace', headers: { authorization: `Bearer ${token}` } });
    const entities = ws.json().entities as Array<{ id: string; kind: string }>;
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    return {
      token,
      userId,
      workspaceId: ws.json().workspace.id as string,
      pf: entities.find((e) => e.kind === 'pf')!.id,
      pj: entities.find((e) => e.kind === 'pj')?.id,
    };
  }

  function call(user: User, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
    return app.inject({ method, url, headers: { authorization: `Bearer ${user.token}` }, payload: payload as never });
  }

  async function connect(user: User, label: string) {
    const itemId = `item-${label}-${runId}`;
    owners.set(itemId, user.userId);
    const res = await call(user, 'POST', '/api/openfinance/connect-item', { itemId });
    return { res, itemId };
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    mei = await signUp('mei', 'mei');
    pessoa = await signUp('pf', 'pessoa_fisica');
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

  it('MEI: contas novas ficam sem entidade e a resposta lista as contas para classificar', async () => {
    const { res } = await connect(mei, 'mei-novo');

    expect(res.statusCode).toBe(201);
    const accounts = res.json().accounts as Array<{ id: string; name: string; kind: string; entityId: string | null }>;
    expect(accounts).toHaveLength(2);
    expect(accounts.every((a) => a.entityId === null)).toBe(true);
    const stored = await prisma.bankAccount.findMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    expect(stored.every((a) => a.entityId === null)).toBe(true);
  });

  it('pessoa física sem PJ: contas vão direto para a PF', async () => {
    const { res } = await connect(pessoa, 'pf-novo');

    expect(res.statusCode).toBe(201);
    const accounts = res.json().accounts as Array<{ entityId: string | null }>;
    expect(accounts.every((a) => a.entityId === pessoa.pf)).toBe(true);
  });

  it('PF + autônomo (sem PJ): também pergunta de quem é a conta', async () => {
    const autonomo = await signUp('autonomo', 'pessoa_fisica');
    const onboarding = await call(autonomo, 'POST', '/api/onboarding', {
      profile: 'negocio',
      businesses: [{ type: 'autonomo', name: 'Aulas particulares' }],
    });
    expect(onboarding.statusCode).toBe(200);

    const { res } = await connect(autonomo, 'autonomo-novo');

    expect(res.statusCode).toBe(201);
    expect((res.json().accounts as Array<{ entityId: string | null }>).every((a) => a.entityId === null)).toBe(true);
  });

  it('PATCH define a entidade, aparece na lista de conexões e sobrevive à sincronização', async () => {
    const { res } = await connect(mei, 'mei-patch');
    const [conta] = res.json().accounts as Array<{ id: string }>;

    const patch = await call(mei, 'PATCH', `/api/openfinance/bank-accounts/${conta!.id}`, { entityId: mei.pf });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().entityId).toBe(mei.pf);

    const list = await call(mei, 'GET', '/api/openfinance/connections');
    const listed = (list.json().connections as Array<{ accounts: Array<{ id: string; entityId: string | null }> }>)
      .flatMap((c) => c.accounts)
      .find((a) => a.id === conta!.id);
    expect(listed?.entityId).toBe(mei.pf);

    const sync = await call(mei, 'POST', `/api/openfinance/connections/${res.json().connectionId}/sync`);
    expect(sync.statusCode).toBe(200);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: conta!.id } })).entityId).toBe(mei.pf);
  });

  it('PATCH recusa entidade ou conta de outro workspace (404) e corpo inválido (400)', async () => {
    const { res } = await connect(mei, 'mei-idor');
    const [conta] = res.json().accounts as Array<{ id: string }>;
    const { res: resPf } = await connect(pessoa, 'pf-idor');
    const [contaDaPessoa] = resPf.json().accounts as Array<{ id: string }>;

    expect((await call(mei, 'PATCH', `/api/openfinance/bank-accounts/${conta!.id}`, { entityId: pessoa.pf })).statusCode).toBe(404);
    expect((await call(mei, 'PATCH', `/api/openfinance/bank-accounts/${contaDaPessoa!.id}`, { entityId: mei.pf })).statusCode).toBe(404);
    expect((await call(mei, 'PATCH', `/api/openfinance/bank-accounts/${conta!.id}`, { entityId: 'nao-e-uuid' })).statusCode).toBe(400);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: contaDaPessoa!.id } })).entityId).toBe(pessoa.pf);
  });

  it('connect-item recusa entityId de outro workspace no corpo', async () => {
    const itemId = `item-mei-corpo-${runId}`;
    owners.set(itemId, mei.userId);

    const res = await call(mei, 'POST', '/api/openfinance/connect-item', { itemId, entityId: pessoa.pf });

    expect(res.statusCode).toBe(404);
    expect(await prisma.bankAccount.count({ where: { externalId: `${itemId}-cc` } })).toBe(0);
  });

  it('aprovar sem entityId usa a entidade da conta', async () => {
    const { res } = await connect(mei, 'mei-aprova');
    const [conta] = res.json().accounts as Array<{ id: string }>;
    await call(mei, 'PATCH', `/api/openfinance/bank-accounts/${conta!.id}`, { entityId: mei.pf });
    const bankTx = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: conta!.id } });

    const approve = await call(mei, 'POST', '/api/imports/approve', { bankTransactionId: bankTx.id });

    expect(approve.statusCode).toBe(200);
    expect(approve.json().entityId).toBe(mei.pf);
  });

  it('aprovar transação de conta sem entidade é recusado e nada é lançado', async () => {
    const { res } = await connect(mei, 'mei-sem-entidade');
    const [conta] = res.json().accounts as Array<{ id: string }>;
    const bankTx = await prisma.bankTransaction.findFirstOrThrow({ where: { bankAccountId: conta!.id } });

    const approve = await call(mei, 'POST', '/api/imports/approve', { bankTransactionId: bankTx.id });

    expect(approve.statusCode).toBe(400);
    expect(approve.json().code).toBe('ACCOUNT_ENTITY_REQUIRED');
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: bankTx.id } })).status).toBe('nova');
  });
});
