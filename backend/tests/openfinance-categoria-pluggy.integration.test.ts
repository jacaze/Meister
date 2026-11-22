import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Importação da Pluggy: a categoria que o banco envia vira sugestão (respeitando a direção) e,
// sem sugestão nem escolha, a aprovação cai em "Outras Despesas/Receitas" por slug.

interface PluggyTx {
  id: string;
  description: string;
  amount: number;
  category?: string;
  type: 'DEBIT' | 'CREDIT';
}

describe('OpenFinance: categoria sugerida na importação da Pluggy e fallback na aprovação', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  const originalFetch = globalThis.fetch;
  const saved = {
    id: process.env.PLUGGY_CLIENT_ID,
    secret: process.env.PLUGGY_CLIENT_SECRET,
    base: process.env.PLUGGY_BASE_URL,
  };
  const owners = new Map<string, string>();
  const txsByItem = new Map<string, PluggyTx[]>();
  const date = new Date().toISOString().slice(0, 10);

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
    if (u.pathname === '/accounts') {
      const itemId = u.searchParams.get('itemId')!;
      return json({ results: [{ id: `${itemId}-cc`, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta' }] });
    }
    if (u.pathname === '/v2/transactions') {
      const itemId = u.searchParams.get('accountId')!.replace(/-cc$/, '');
      const results = (txsByItem.get(itemId) ?? []).map((t) => ({ ...t, date }));
      return json({ results, next: null });
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => null } as unknown as Response;
  }

  async function signUp(label: string) {
    const email = `catpluggy_${label}_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: `Usuário ${label}`, email, password: 'Password123!', accountType: 'pessoa_fisica' },
    });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const token = login.json().token as string;
    const ws = await app.inject({ method: 'GET', url: '/api/workspace', headers: { authorization: `Bearer ${token}` } });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    return { token, userId, workspaceId: ws.json().workspace.id as string };
  }

  async function connect(user: { token: string; userId: string }, label: string, txs: PluggyTx[]) {
    const itemId = `item-${label}-${runId}`;
    owners.set(itemId, user.userId);
    txsByItem.set(itemId, txs);
    const res = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { itemId },
    });
    expect(res.statusCode).toBe(201);
    return itemId;
  }

  async function slugSugerido(txId: string): Promise<string | null> {
    const bank = await prisma.bankTransaction.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'pluggy', externalId: txId } },
    });
    if (!bank.suggestedCategoryId) return null;
    return (await prisma.category.findUniqueOrThrow({ where: { id: bank.suggestedCategoryId } })).slug;
  }

  async function approveRaw(user: { token: string }, txId: string) {
    const bank = await prisma.bankTransaction.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'pluggy', externalId: txId } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { bankTransactionId: bank.id, categoryId: null },
    });
    return { res, bank };
  }

  async function approve(user: { token: string }, txId: string) {
    const { res } = await approveRaw(user, txId);
    expect(res.statusCode).toBe(200);
    const lancamento = await prisma.transaction.findUniqueOrThrow({ where: { id: res.json().id } });
    const categoria = lancamento.categoryId
      ? await prisma.category.findUniqueOrThrow({ where: { id: lancamento.categoryId } })
      : null;
    return categoria;
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
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

  it('sugere pela categoria da Pluggy, respeita a direção e deixa transferência sem sugestão', async () => {
    const user = await signUp('mapa');
    const p = `m${runId}`;
    await connect(user, 'mapa', [
      { id: `${p}-1`, description: 'COMPRA ZXQ 1', amount: -80, category: 'Groceries', type: 'DEBIT' },
      { id: `${p}-2`, description: 'PAGTO ZXQ 2', amount: -190, category: 'Electricity', type: 'DEBIT' },
      { id: `${p}-3`, description: 'ENTRADA ZXQ 3', amount: 5000, category: 'Income', type: 'CREDIT' },
      { id: `${p}-4`, description: 'PIX ZXQ 4', amount: -300, category: 'Transfer - PIX', type: 'DEBIT' },
      { id: `${p}-5`, description: 'MERCADO PAGO ZXQ 5', amount: -45, category: 'Transfer - PIX', type: 'DEBIT' },
      { id: `${p}-6`, description: 'SEM PISTA ZXQ 6', amount: -12, type: 'DEBIT' },
      { id: `${p}-7`, description: 'ESTORNO ZXQ 7', amount: 60, category: 'Shopping', type: 'CREDIT' },
      { id: `${p}-8`, description: 'ASSINATURA ZXQ 8', amount: -30, category: 'Video streaming', type: 'DEBIT' },
    ]);

    expect(await slugSugerido(`${p}-1`)).toBe('alimentacao');
    expect(await slugSugerido(`${p}-2`)).toBe('moradia');
    expect(await slugSugerido(`${p}-3`)).toBe('outras-receitas');
    expect(await slugSugerido(`${p}-4`)).toBeNull();
    expect(await slugSugerido(`${p}-5`)).toBeNull(); // "mercado" na descrição não vence "Transfer - PIX"
    expect(await slugSugerido(`${p}-6`)).toBeNull();
    expect(await slugSugerido(`${p}-7`)).toBeNull(); // reembolso de compra: nenhuma receita casa com Shopping
    expect(await slugSugerido(`${p}-8`)).toBe('lazer');
  });

  it('aprovar sem categoria cai em Outras Despesas/Receitas e nunca em categoria arbitrária', async () => {
    const user = await signUp('fallback');
    const p = `f${runId}`;
    await connect(user, 'fallback', [
      { id: `${p}-1`, description: 'PIX ZXQ 1', amount: -300, category: 'Transfer - PIX', type: 'DEBIT' },
      { id: `${p}-2`, description: 'PIX ZXQ 2', amount: 300, category: 'Transfer - PIX', type: 'CREDIT' },
    ]);

    const despesa = await approve(user, `${p}-1`);
    const receita = await approve(user, `${p}-2`);

    expect(despesa?.slug).toBe('outras-despesas');
    expect(despesa?.type).toBe('despesa');
    expect(despesa?.workspaceId).toBe(user.workspaceId);
    expect(receita?.slug).toBe('outras-receitas');
    expect(receita?.type).toBe('receita');
  });

  it('sem a categoria padrão no workspace não escolhe outra: o ledger recusa e o item segue na fila', async () => {
    const user = await signUp('sem-padrao');
    const p = `s${runId}`;
    await prisma.category.updateMany({
      where: { workspaceId: user.workspaceId, slug: 'outras-despesas' },
      data: { archivedAt: new Date() },
    });
    await connect(user, 'sem-padrao', [
      { id: `${p}-1`, description: 'PIX ZXQ 1', amount: -300, category: 'Transfer - PIX', type: 'DEBIT' },
    ]);

    const { res, bank } = await approveRaw(user, `${p}-1`);

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('A categoria é obrigatória');
    const depois = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: bank.id } });
    expect(depois.status).toBe('nova');
    expect(depois.importedTransactionId).toBeNull();
  });
});
