import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Core Modules Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('provisions workspace with PF & PJ entities on MEI register and updates business profile with CNPJ', async () => {
    const email = `mei_corp_${Date.now()}@test.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Carlos Eletricista MEI',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regBody = regRes.json();
    expect(regBody.user.workspaceId).toBeDefined();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    const token = loginRes.json().token as string;

    // 1. Get Workspace Overview
    const wsRes = await app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wsRes.statusCode).toBe(200);
    const wsOverview = wsRes.json();
    expect(wsOverview.role).toBe('owner');
    expect(wsOverview.entities.length).toBe(2);

    const pjEntity = wsOverview.entities.find((e: { kind: string }) => e.kind === 'pj');
    expect(pjEntity).toBeDefined();
    expect(pjEntity.name).toBe('Meu MEI');
    expect(pjEntity.isMei).toBe(true);
    expect(pjEntity.profileComplete).toBe(false);

    // 2. Update Business Profile with valid CNPJ, opening date and activity
    // Valid generated CNPJ: 45.123.456/0001-89 (or calculate valid check digits for 451234560001)
    // 451234560001:
    // d1 = 11 - (4*5 + 5*4 + 1*3 + 2*2 + 3*9 + 4*8 + 5*7 + 6*6 + 0*5 + 0*4 + 0*3 + 1*2)%11 = 11 - 188%11 = 11 - 1 = 10 -> 0 -> let's use known valid CNPJ: 11.222.333/0001-81
    // 112223330001:
    // sum1 = 1*5+1*4+2*3+2*2+2*9+3*8+3*7+3*6+0*5+0*4+0*3+1*2 = 5+4+6+4+18+24+21+18+2 = 102 % 11 = 3 -> 11 - 3 = 8.
    // sum2 = 1*6+1*5+2*4+2*3+2*2+3*9+3*8+3*7+0*6+0*5+0*4+1*3+8*2 = 6+5+8+6+4+27+24+21+3+16 = 120 % 11 = 10 -> 11 - 10 = 1.
    // So 11.222.333/0001-81 is mathematically valid!
    function generateUniqueValidCnpj(): string {
      const random8 = String(Math.floor(10000000 + Math.random() * 90000000));
      const base = `${random8}0001`;
      const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum1 = 0;
      for (let i = 0; i < 12; i++) sum1 += Number(base[i]) * w1[i]!;
      const rem1 = sum1 % 11;
      const d1 = rem1 < 2 ? 0 : 11 - rem1;

      const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum2 = 0;
      const withD1 = `${base}${d1}`;
      for (let i = 0; i < 13; i++) sum2 += Number(withD1[i]) * w2[i]!;
      const rem2 = sum2 % 11;
      const d2 = rem2 < 2 ? 0 : 11 - rem2;

      return `${base}${d1}${d2}`;
    }

    const validCnpj = generateUniqueValidCnpj();

    const updateProfileRes = await app.inject({
      method: 'PUT',
      url: `/api/entities/${pjEntity.id}/business-profile`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cnpj: validCnpj,
        legalName: 'Carlos Silva Instalacoes MEI',
        openedOn: '2026-02-15',
        activity: 'servicos',
      },
    });
    expect(updateProfileRes.statusCode).toBe(200);
    const updatedEntity = updateProfileRes.json();
    expect(updatedEntity.cnpj).toBe(validCnpj);
    expect(updatedEntity.activity).toBe('servicos');

    // 3. Proportional MEI limit check for opening in Feb 2026
    // Months = 12 - (2 - 1) = 11 months -> 11 * 6750 = 74,250.00
    const limitRes = await app.inject({
      method: 'GET',
      url: `/api/mei/limit?entityId=${pjEntity.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(limitRes.statusCode).toBe(200);
    const limitData = limitRes.json();
    expect(limitData.proporcional).toBe(true);
    expect(limitData.mesesAtividade).toBe(11);
    expect(limitData.limite).toBe('74250.00');
    expect(limitData.perfilIncompleto).toBe(false);
  });

  it('generates DAS charges automatically, lists them, and allows marking/unmarking as paid', async () => {
    const email = `mei_das_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'DAS Teste', email, password: 'Password123!', accountType: 'mei' },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { email, password: 'Password123!' },
      })
    ).json().token as string;

    const listDasRes = await app.inject({
      method: 'GET',
      url: '/api/das',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listDasRes.statusCode).toBe(200);
    const dasData = listDasRes.json();
    expect(Array.isArray(dasData.items)).toBe(true);
    expect(dasData.items.length).toBeGreaterThan(0);
    expect(dasData.totais).toBeDefined();

    const firstDas = dasData.items[0];
    const latestDas = dasData.items[dasData.items.length - 1];
    expect(firstDas.status).toBe('atrasado');
    expect(latestDas.status).toBe('pendente');

    // Mark as paid
    const payRes = await app.inject({
      method: 'POST',
      url: `/api/das/${firstDas.id}/pay`,
      headers: { authorization: `Bearer ${token}` },
      payload: { paidOn: '2026-11-01', paidAmount: firstDas.amount },
    });
    expect(payRes.statusCode).toBe(200);
    expect(payRes.json().status).toBe('pago');

    // Unmark paid
    const unpayRes = await app.inject({
      method: 'DELETE',
      url: `/api/das/${firstDas.id}/pay`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unpayRes.statusCode).toBe(200);
    expect(unpayRes.json().status).toBe('pendente');
  });

  it('manages financial jars: lists templates, provides status with Largest Remainder allocation and category mapping', async () => {
    const email = `jars_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Potes Teste', email, password: 'Password123!', accountType: 'pessoa_fisica' },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { email, password: 'Password123!' },
      })
    ).json().token as string;

    // 1. Get templates
    const templatesRes = await app.inject({
      method: 'GET',
      url: '/api/jars/templates',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(templatesRes.statusCode).toBe(200);
    expect(templatesRes.json().length).toBeGreaterThanOrEqual(3);

    // 2. Add confirmed revenue transaction
    const catRec = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Salário', type: 'receita' },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        categoryId: catRec.id,
        type: 'receita',
        description: 'Salário Mensal',
        amount: '5000.00',
        paymentMethod: 'pix',
        transactionDate: '2026-11-01',
      },
    });

    // 3. Check Jars Status (defaults to 'seis-potes' for PF)
    const jarsRes = await app.inject({
      method: 'GET',
      url: '/api/jars',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(jarsRes.statusCode).toBe(200);
    const jarsStatus = jarsRes.json();
    expect(jarsStatus.base).toBe('5000.00');
    expect(jarsStatus.jars.length).toBe(6);

    // Necessidades (55% of 5000.00 = 2750.00)
    const necessidades = jarsStatus.jars.find((j: { slug: string }) => j.slug === 'necessidades');
    expect(necessidades.alocado).toBe('2750.00');
    expect(necessidades.status).toBe('ok');
  });

  it('creates transfers between accounts and records pró-labore owner withdrawals', async () => {
    const email = `transfer_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Transfer Teste', email, password: 'Password123!', accountType: 'mei' },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { email, password: 'Password123!' },
      })
    ).json().token as string;

    const wsOverview = (
      await app.inject({
        method: 'GET',
        url: '/api/workspace',
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();

    const pfEntity = wsOverview.entities.find((e: { kind: string }) => e.kind === 'pf');
    const pjEntity = wsOverview.entities.find((e: { kind: string }) => e.kind === 'pj');

    // Create 2 accounts in the database for transfer testing
    const accFrom = await prisma.financialAccount.create({
      data: {
        workspaceId: wsOverview.workspace.id,
        entityId: pjEntity.id,
        kind: 'banco',
        name: 'Conta PJ Nubank',
      },
    });
    const accTo = await prisma.financialAccount.create({
      data: {
        workspaceId: wsOverview.workspace.id,
        entityId: pfEntity.id,
        kind: 'banco',
        name: 'Conta PF Inter',
      },
    });

    // Execute transfer
    const transferRes = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fromAccountId: accFrom.id,
        toAccountId: accTo.id,
        amount: '1500.00',
        occurredOn: '2026-11-02',
        description: 'Transferência de caixa',
      },
    });
    expect(transferRes.statusCode).toBe(201);
    const transferData = transferRes.json();
    expect(transferData.transferGroupId).toBeDefined();
    expect(transferData.legOut.direction).toBe('out');
    expect(transferData.legIn.direction).toBe('in');

    // Register owner withdrawal (Pró-labore PJ -> PF)
    const withdrawalRes = await app.inject({
      method: 'POST',
      url: '/api/owner-withdrawals',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        amount: '2000.00',
        occurredOn: '2026-11-03',
        description: 'Pró-labore do mês',
      },
    });
    expect(withdrawalRes.statusCode).toBe(201);
    const withdrawalData = withdrawalRes.json();
    expect(withdrawalData.legPj.entityId).toBe(pjEntity.id);
    expect(withdrawalData.legPf.entityId).toBe(pfEntity.id);
  });
});
