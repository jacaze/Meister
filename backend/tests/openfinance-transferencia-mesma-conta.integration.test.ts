import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Transferência entre contas PRÓPRIAS exige contas diferentes. Saída e entrada de mesmo valor na mesma
// conta (ex.: recebeu R$ 15 de uma pessoa e mandou R$ 15 a outra) não são transferência.

interface FakeTx {
  id: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
}

describe('OpenFinance — suspeita de transferência só entre contas diferentes', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  const originalFetch = globalThis.fetch;
  const saved = {
    id: process.env.PLUGGY_CLIENT_ID,
    secret: process.env.PLUGGY_CLIENT_SECRET,
    base: process.env.PLUGGY_BASE_URL,
  };
  const owners = new Map<string, string>();
  // accountId -> transações simuladas
  const txsByAccount = new Map<string, FakeTx[]>();
  let token: string;
  let userId: string;
  const today = new Date().toISOString().slice(0, 10);

  function json(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }

  async function fakePluggyFetch(url: string | URL | Request): Promise<Response> {
    const u = new URL(String(url));
    if (u.pathname === '/auth') return json({ apiKey: 'k' });
    const itemMatch = u.pathname.match(/^\/items\/([^/]+)$/);
    if (itemMatch) {
      return json({
        id: itemMatch[1],
        status: 'UPDATED',
        clientUserId: owners.get(itemMatch[1]!),
        connector: { id: 1, name: 'Banco Simulado' },
        createdAt: '2026-11-01T00:00:00.000Z',
      });
    }
    if (/^\/items\/[^/]+\/sync$/.test(u.pathname)) return json({ status: 'UPDATING' });
    if (u.pathname === '/accounts') {
      const itemId = u.searchParams.get('itemId')!;
      const accounts = [...txsByAccount.keys()]
        .filter((id) => id.startsWith(`${itemId}:`))
        .map((id) => ({ id, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: `Conta ${id}` }));
      return json({ results: accounts });
    }
    if (u.pathname === '/v2/transactions') {
      const accountId = u.searchParams.get('accountId')!;
      const results = (txsByAccount.get(accountId) ?? []).map((t) => ({
        id: t.id,
        description: 'PIX',
        amount: t.amount,
        date: today,
        type: t.type,
      }));
      return json({ results, next: null });
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => null } as unknown as Response;
  }

  async function connect(label: string, accounts: Record<string, FakeTx[]>) {
    const itemId = `item-${label}-${runId}`;
    owners.set(itemId, userId);
    for (const [acc, txs] of Object.entries(accounts)) txsByAccount.set(`${itemId}:${acc}`, txs);
    const res = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId },
    });
    const rows = await prisma.bankTransaction.findMany({
      where: { connection: { itemId } },
      orderBy: { externalId: 'asc' },
    });
    return { res, rows };
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const email = `transf_mesma_conta_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Usuário Transf', email, password: 'Password123!', accountType: 'pessoa_fisica' },
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

  it('entrada e saída de R$ 15 na MESMA conta não são suspeitas', async () => {
    const { res, rows } = await connect('mesma', {
      a: [
        { id: `m-in-${runId}`, amount: 15, type: 'CREDIT' },
        { id: `m-out-${runId}`, amount: -15, type: 'DEBIT' },
      ],
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().transferSuspectsCount).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isTransferSuspect === false)).toBe(true);
  });

  it('saída numa conta e entrada de mesmo valor em OUTRA conta são suspeitas', async () => {
    const { res, rows } = await connect('diferentes', {
      a: [{ id: `d-out-${runId}`, amount: -15.5, type: 'DEBIT' }],
      b: [{ id: `d-in-${runId}`, amount: 15.5, type: 'CREDIT' }],
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().transferSuspectsCount).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isTransferSuspect === true)).toBe(true);
    expect(new Set(rows.map((r) => r.bankAccountId)).size).toBe(2);
  });

  it('extrato importado (um arquivo = uma conta): entrada e saída de mesmo valor não são suspeitas', async () => {
    const fitIn = `OFX-TRF-${runId}-IN`;
    const fitOut = `OFX-TRF-${runId}-OUT`;
    const ofx = `
OFXHEADER:100
<OFX>
  <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261103120000</DTPOSTED><TRNAMT>15.00</TRNAMT><FITID>${fitIn}</FITID><MEMO>PIX RECEBIDO PESSOA A</MEMO></STMTTRN>
  <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261104120000</DTPOSTED><TRNAMT>-15.00</TRNAMT><FITID>${fitOut}</FITID><MEMO>PIX ENVIADO PESSOA B</MEMO></STMTTRN>
</OFX>`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: { authorization: `Bearer ${token}` },
      payload: { content: ofx, provider: 'ofx', institution: 'Banco Simulado' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().importedCount).toBe(2);
    expect(res.json().transferSuspectsCount).toBe(0);
    const rows = await prisma.bankTransaction.findMany({ where: { externalId: { in: [fitIn, fitOut] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isTransferSuspect === false)).toBe(true);
  });
});
