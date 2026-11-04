import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Insights Module Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let email: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    email = `insight_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Roberto MEI Consultor',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    token = loginRes.json().token as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('runs detectors, fetches insights list, asks finances, and queries monthly digest', async () => {
    // 1. Fetch categories
    const catRes = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { authorization: `Bearer ${token}` },
    });
    const categories = catRes.json() as Array<{ id: string; name: string; type: string }>;
    const receitaCat = categories.find((c) => c.type === 'receita') || categories[0];
    const despesaCat = categories.find((c) => c.type === 'despesa') || categories[1] || categories[0];

    // 2. Create some sample transactions
    const recRes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: 'receita',
        amount: '3500.00',
        description: 'Consultoria Estratégica',
        categoryId: receitaCat?.id,
        transactionDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(recRes.statusCode).toBe(201);

    const despRes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: 'despesa',
        amount: '450.00',
        description: 'Software e Ferramentas',
        categoryId: despesaCat?.id,
        transactionDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(despRes.statusCode).toBe(201);

    // 3. Query Monthly Digest
    const digestRes = await app.inject({
      method: 'GET',
      url: '/api/insights/digest',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(digestRes.statusCode).toBe(200);
    const digest = digestRes.json();
    expect(digest.totalIncome).toContain('3500,00');
    expect(digest.totalExpense).toContain('450,00');
    expect(digest.isPositive).toBe(true);
    expect(digest.points.length).toBeGreaterThan(0);

    // 4. Ask finances about balance and reject investment
    const askBalanceRes = await app.inject({
      method: 'POST',
      url: '/api/insights/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'Qual é o meu saldo em caixa agora?' },
    });

    expect(askBalanceRes.statusCode).toBe(200);
    expect(askBalanceRes.json().intent).toBe('saldo');
    expect(askBalanceRes.json().answer).toContain('3050,00');

    const askAdviceRes = await app.inject({
      method: 'POST',
      url: '/api/insights/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: 'Onde devo investir meu dinheiro em ações ou criptomoedas?' },
    });

    expect(askAdviceRes.statusCode).toBe(200);
    expect(askAdviceRes.json().intent).toBe('recusa_orientacao');
    expect(askAdviceRes.json().answer).toContain('não faz recomendações de investimento');

    // 5. Query Insights list
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/insights',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.json().items)).toBe(true);
  });
});
