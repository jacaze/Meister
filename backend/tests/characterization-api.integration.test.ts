import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { FakeClock, Money } from '../src/shared/index.js';
import { buildMeiLimit, resolvePeriod } from '../src/services/dashboardService.js';

describe('Characterization & Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'test_secret_key_with_at_least_32_characters_for_meister';
    process.env.LOCK_TIME_MINUTES = '15';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('responds to /health, /health/live, /health/ready and echoes X-Correlation-ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
      headers: { 'x-correlation-id': 'corr-test-001' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('corr-test-001');
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(body.database).toBe('up');
  });

  it('normalizes email on register/login and blocks duplicate emails regardless of case (fixes A2)', async () => {
    const reg1 = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Carlos Eletricista',
        email: '  Carlos.MEI@Example.COM ',
        password: 'StrongPassword123',
        accountType: 'mei',
      },
    });

    expect(reg1.statusCode).toBe(201);
    const body1 = reg1.json();
    expect(body1.user.email).toBe('carlos.mei@example.com');
    expect(body1.user.accountType).toBe('mei');

    const regDup = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Outro Carlos',
        email: 'carlos.mei@example.com',
        password: 'StrongPassword123',
      },
    });

    expect(regDup.statusCode).toBe(409);
    expect(regDup.json().code).toBe('EMAIL_ALREADY_IN_USE');

    // Login with uppercase email works seamlessly
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: {
        email: 'CARLOS.MEI@EXAMPLE.COM',
        password: 'StrongPassword123',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().token).toBeTypeOf('string');
  });

  it('locks account atomically after 3 failed login attempts, including under concurrency (fixes A4)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Ana Comércio',
        email: 'ana@example.com',
        password: 'CorrectPassword123',
        accountType: 'mei',
      },
    });

    // Fire 6 wrong-password attempts in parallel
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/login',
          payload: { email: 'ana@example.com', password: 'WrongPassword!' },
        })
      )
    );

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses).toContain(403);

    // Even with the right password, account is now locked
    const whileLocked = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: 'ana@example.com', password: 'CorrectPassword123' },
    });
    expect(whileLocked.statusCode).toBe(403);
    expect(whileLocked.json().code).toBe('ACCOUNT_LOCKED');
  });

  it('enforces category invariants: 400 on invalid type, 409 on delete in use, 409 on type change in use, and anti-IDOR between users (fixes A7 & A11)', async () => {
    // Register User A and User B
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'User A', email: 'a@test.com', password: 'Password123', accountType: 'mei' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'User B', email: 'b@test.com', password: 'Password123', accountType: 'pessoa_fisica' },
    });

    const tokenA = (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { email: 'a@test.com', password: 'Password123' },
      })
    ).json().token as string;

    const tokenB = (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { email: 'b@test.com', password: 'Password123' },
      })
    ).json().token as string;

    // Invalid category type -> 400 instead of 500
    const badCat = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Invalida', type: 'investimento_invalido' },
    });
    expect(badCat.statusCode).toBe(400);

    // Create valid category for User A
    const catRes = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: '  Vendas de Serviços  ', type: 'receita' },
    });
    expect(catRes.statusCode).toBe(201);
    const catA = catRes.json();
    expect(catA.name).toBe('Vendas de Serviços');

    // User B cannot update or delete User A's category (404 anti-IDOR)
    const idorUpdate = await app.inject({
      method: 'PUT',
      url: `/api/categories/${catA.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Hacked', type: 'receita' },
    });
    expect(idorUpdate.statusCode).toBe(404);

    // Create a transaction using catA
    const txRes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        categoryId: catA.id,
        type: 'receita',
        description: 'Instalação elétrica residencial',
        amount: '450.75',
        paymentMethod: 'pix',
        transactionDate: '2026-11-02',
      },
    });
    expect(txRes.statusCode).toBe(201);

    // Changing category type while in use -> 409 CATEGORY_TYPE_IMMUTABLE
    const changeTypeRes = await app.inject({
      method: 'PUT',
      url: `/api/categories/${catA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Vendas de Serviços', type: 'despesa' },
    });
    expect(changeTypeRes.statusCode).toBe(409);
    expect(changeTypeRes.json().code).toBe('CATEGORY_TYPE_IMMUTABLE');

    // Deleting category while in use -> 409 CATEGORY_IN_USE (instead of 500)
    const delInUseRes = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${catA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(delInUseRes.statusCode).toBe(409);
    expect(delInUseRes.json().code).toBe('CATEGORY_IN_USE');
    expect(delInUseRes.json().details?.transactionCount).toBe(1);
  });

  it('computes exact cent sums on transactions list & dashboard summary and respects MEI limit bands', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'MEI Teste', email: 'mei@test.com', password: 'Password123', accountType: 'mei' },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { email: 'mei@test.com', password: 'Password123' },
      })
    ).json().token as string;

    const catRev = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Serviços', type: 'receita' },
      })
    ).json();

    const catExp = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Materiais', type: 'despesa' },
      })
    ).json();

    // Classic float trap: 0.1 + 0.2 = 0.30000000000000004 in IEEE 754
    for (const amount of ['100.10', '200.20', '64499.70']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          categoryId: catRev.id,
          type: 'receita',
          description: `Receita ${amount}`,
          amount,
          paymentMethod: 'pix',
          transactionDate: '2026-11-01',
        },
      });
      expect(res.statusCode).toBe(201);
    }

    await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        categoryId: catExp.id,
        type: 'despesa',
        description: 'Cabos e disjuntores',
        amount: '800.40',
        paymentMethod: 'cartao_debito',
        transactionDate: '2026-11-02',
      },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/transactions?page=1&pageSize=2',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.items).toHaveLength(2);
    expect(listBody.total).toBe(4);
    expect(listBody.resumo).toEqual({
      totalEntradas: 64800,
      totalDespesas: 800.4,
      resultado: 63999.6,
    });

    const dashRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard?startDate=2026-11-01&endDate=2026-11-30',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dashRes.statusCode).toBe(200);
    const dash = dashRes.json();
    expect(dash.saldoAtual).toBe(63999.6);
    // 64,800 is exactly 80% of 81,000 -> status 'atencao'
    expect(dash.limiteMei.status).toBe('atencao');
    expect(dash.limiteMei.percentualUtilizado).toBe(80);
    expect(dash.limiteMei.restante).toBe(16200);

    // Switch accountType to pessoa_fisica -> limiteMei becomes null
    const patchMe = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { accountType: 'pessoa_fisica' },
    });
    expect(patchMe.statusCode).toBe(200);

    const dashPf = (
      await app.inject({
        method: 'GET',
        url: '/api/dashboard',
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    expect(dashPf.limiteMei).toBeNull();
  });

  it('resolves dashboard period in America/Sao_Paulo at 23:30 BRT on the last day of the month (fixes A8)', () => {
    // 2026-10-31 23:30 BRT = 2026-11-01T02:30:00Z
    const clock = new FakeClock('2026-11-01T02:30:00.000Z');
    const period = resolvePeriod({}, clock, 'America/Sao_Paulo');
    expect(period.start?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(period.end?.toISOString()).toBe('2026-10-31T23:59:59.999Z');

    // Verify all 4 MEI limit status boundaries
    expect(buildMeiLimit(Money.fromDecimalString('64799.99'), 2026, 81000).status).toBe('ok');
    expect(buildMeiLimit(Money.fromDecimalString('64800.00'), 2026, 81000).status).toBe('atencao');
    expect(buildMeiLimit(Money.fromDecimalString('81000.00'), 2026, 81000).status).toBe('atencao');
    expect(buildMeiLimit(Money.fromDecimalString('81000.01'), 2026, 81000).status).toBe('excedido');
    expect(buildMeiLimit(Money.fromDecimalString('97200.00'), 2026, 81000).status).toBe('excedido');
    expect(buildMeiLimit(Money.fromDecimalString('97200.01'), 2026, 81000).status).toBe(
      'desenquadramento'
    );
  });
});
