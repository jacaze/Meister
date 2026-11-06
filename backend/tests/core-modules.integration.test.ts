import fs from 'node:fs';
import path from 'node:path';
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

    // 4. Test category mapping & unmapping
    const catDesp = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Aluguel', type: 'despesa' },
      })
    ).json();

    // Map 2 categories
    const mapRes1 = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        jarId: necessidades.id,
        categoryIds: [catRec.id, catDesp.id],
      },
    });
    expect(mapRes1.statusCode).toBe(200);

    let mappedCount = await prisma.jarCategory.count({
      where: { jarId: necessidades.id },
    });
    expect(mappedCount).toBe(2);

    // Unmap one category by sending only [catRec.id]
    const mapRes2 = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        jarId: necessidades.id,
        categoryIds: [catRec.id],
      },
    });
    expect(mapRes2.statusCode).toBe(200);

    mappedCount = await prisma.jarCategory.count({
      where: { jarId: necessidades.id },
    });
    expect(mappedCount).toBe(1);

    // Unmap all by sending empty array []
    const mapRes3 = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        jarId: necessidades.id,
        categoryIds: [],
      },
    });
    expect(mapRes3.statusCode).toBe(200);

    mappedCount = await prisma.jarCategory.count({
      where: { jarId: necessidades.id },
    });
    expect(mappedCount).toBe(0);

    // Test batch mapping & foreign category rejection (IDOR protection)
    const fakeCategoryId = 'cat_fake_123456789';
    const rejectRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories/batch',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        mappings: [{ jarId: necessidades.id, categoryIds: [fakeCategoryId] }],
      },
    });
    expect(rejectRes.statusCode).toBe(400);

    // Test malformed payload validation (Zod schema protection)
    const malformedRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories/batch',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: '',
        mappings: 'invalid',
      },
    });
    expect(malformedRes.statusCode).toBe(400);

    // Test duplicate category across different jars rejection
    const outroPote = jarsStatus.jars.find((j: { slug: string }) => j.slug === 'liberdade') || jarsStatus.jars[1];
    const duplicateCrossJarRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories/batch',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        mappings: [
          { jarId: necessidades.id, categoryIds: [catRec.id] },
          { jarId: outroPote.id, categoryIds: [catRec.id] },
        ],
      },
    });
    expect(duplicateCrossJarRes.statusCode).toBe(400);
    expect(duplicateCrossJarRes.json().message).toContain('múltiplos potes');

    // Test repeated IDs in single mapping (deduplication without false rejection)
    const dedupeRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        jarId: necessidades.id,
        categoryIds: [catRec.id, catRec.id],
      },
    });
    expect(dedupeRes.statusCode).toBe(200);

    // Valid batch mapping
    const batchRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories/batch',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: jarsStatus.planId,
        mappings: [
          { jarId: necessidades.id, categoryIds: [catRec.id] },
        ],
      },
    });
    expect(batchRes.statusCode).toBe(200);
    const batchCount = await prisma.jarCategory.count({
      where: { jarId: necessidades.id },
    });
    expect(batchCount).toBe(1);
  });

  it('applies the plan baseMode to the jars base and updates it without recreating the plan', async () => {
    const email = `jars_base_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Base Potes', email, password: 'Password123!', accountType: 'pessoa_fisica' },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } })
    ).json().token as string;
    const auth = { authorization: `Bearer ${token}` };

    const cat = (
      await app.inject({ method: 'POST', url: '/api/categories', headers: auth, payload: { name: 'Vendas', type: 'receita' } })
    ).json();
    const revenues: Array<[string, string]> = [
      ['2026-08-10', '1500.00'],
      ['2026-09-10', '1500.00'],
      ['2026-10-10', '3000.00'],
      ['2026-11-10', '5000.00'],
    ];
    for (const [date, amount] of revenues) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: auth,
        payload: { categoryId: cat.id, type: 'receita', description: 'Venda', amount, paymentMethod: 'pix', transactionDate: date },
      });
      expect(res.statusCode).toBe(201);
    }

    const status = async () =>
      (await app.inject({ method: 'GET', url: '/api/jars?month=2026-11', headers: auth })).json();

    const initial = await status();
    expect(initial.baseMode).toBe('mes_atual');
    expect(initial.templateSlug).toBe('seis-potes');
    expect(initial.base).toBe('5000.00');

    // Vincula uma categoria para provar que a troca de base não apaga a configuração
    const jar = initial.jars[0];
    await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: auth,
      payload: { planId: initial.planId, jarId: jar.id, categoryIds: [cat.id] },
    });

    const toPrevious = await app.inject({
      method: 'PATCH',
      url: `/api/jars/plan/${initial.planId}`,
      headers: auth,
      payload: { baseMode: 'mes_anterior' },
    });
    expect(toPrevious.statusCode).toBe(200);
    const previous = await status();
    expect(previous.planId).toBe(initial.planId);
    expect(previous.baseMode).toBe('mes_anterior');
    expect(previous.base).toBe('3000.00');
    expect(previous.jars[0].categoryIds).toEqual([cat.id]);

    await app.inject({
      method: 'PATCH',
      url: `/api/jars/plan/${initial.planId}`,
      headers: auth,
      payload: { baseMode: 'media_3_meses' },
    });
    expect((await status()).base).toBe('2000.00');

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/jars/plan/${initial.planId}`,
      headers: auth,
      payload: { baseMode: 'anual' },
    });
    expect(invalid.statusCode).toBe(400);
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

    // Create 3 accounts in the database for transfer testing (2 PJ, 1 PF)
    const accFrom = await prisma.financialAccount.create({
      data: {
        workspaceId: wsOverview.workspace.id,
        entityId: pjEntity.id,
        kind: 'banco',
        name: 'Conta PJ Nubank',
      },
    });
    const accToSameEntity = await prisma.financialAccount.create({
      data: {
        workspaceId: wsOverview.workspace.id,
        entityId: pjEntity.id,
        kind: 'banco',
        name: 'Conta PJ Caixa',
      },
    });
    const accToPf = await prisma.financialAccount.create({
      data: {
        workspaceId: wsOverview.workspace.id,
        entityId: pfEntity.id,
        kind: 'banco',
        name: 'Conta PF Inter',
      },
    });

    // Test rejection: Transfer from PJ to PF must be blocked and guided to owner withdrawals
    const rejectedTransferRes = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fromAccountId: accFrom.id,
        toAccountId: accToPf.id,
        amount: '1500.00',
        occurredOn: '2026-11-02',
        description: 'Transferência direta PJ para PF inválida',
      },
    });
    expect(rejectedTransferRes.statusCode).toBe(400);
    expect(rejectedTransferRes.json().message).toContain('Pró-labore');

    // Execute valid transfer between accounts of the same entity or PF->PF / PF->PJ
    const transferRes = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fromAccountId: accFrom.id,
        toAccountId: accToSameEntity.id,
        amount: '1500.00',
        occurredOn: '2026-11-02',
        description: 'Transferência de caixa PJ',
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

    // Verify transferType distinction in database and listing
    const txListRes = await app.inject({
      method: 'GET',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(txListRes.statusCode).toBe(200);
    const txItems = txListRes.json().items;

    const transferLegOut = txItems.find((t: { id: string }) => t.id === transferData.legOut.id);
    const proLaboreLegPj = txItems.find((t: { id: string }) => t.id === withdrawalData.legPj.id);

    expect(transferLegOut.transferType).toBe('transfer');
    expect(proLaboreLegPj.transferType).toBe('pro_labore');

    // Simulate legacy records with NULL transfer_type and test backfill logic
    const legacyTransferGroupId = `legacy_group_${Date.now()}`;
    await prisma.transaction.createMany({
      data: [
        {
          workspaceId: wsOverview.workspace.id,
          entityId: pjEntity.id,
          type: 'despesa',
          direction: 'out',
          amount: 500,
          description: 'Retirada legada de pró-labore PJ',
          transactionDate: new Date('2026-10-01'),
          transferGroupId: legacyTransferGroupId,
          transferType: null,
          status: 'confirmado',
        },
        {
          workspaceId: wsOverview.workspace.id,
          entityId: pfEntity.id,
          type: 'receita',
          direction: 'in',
          amount: 500,
          description: 'Entrada legada de pró-labore PF',
          transactionDate: new Date('2026-10-01'),
          transferGroupId: legacyTransferGroupId,
          transferType: null,
          status: 'confirmado',
        },
      ],
    });

    const legacyAccountTransferGroupId = `legacy_acc_transfer_${Date.now()}`;
    await prisma.transaction.createMany({
      data: [
        {
          workspaceId: wsOverview.workspace.id,
          entityId: pjEntity.id,
          type: 'despesa',
          direction: 'out',
          amount: 300,
          description: 'Transferência de conta legada OUT',
          transactionDate: new Date('2026-10-02'),
          transferGroupId: legacyAccountTransferGroupId,
          transferType: null,
          status: 'confirmado',
        },
        {
          workspaceId: wsOverview.workspace.id,
          entityId: pjEntity.id,
          type: 'receita',
          direction: 'in',
          amount: 300,
          description: 'Transferência de conta legada IN',
          transactionDate: new Date('2026-10-02'),
          transferGroupId: legacyAccountTransferGroupId,
          transferType: null,
          status: 'confirmado',
        },
      ],
    });

    // Caso 1 do backfill: Categoria com slug 'pro-labore' vinculada mesmo sem padrão estrito PJ->PF
    const proLaboreCategory = await prisma.category.findFirst({
      where: { workspaceId: wsOverview.workspace.id, slug: 'pro-labore' },
    });
    const legacyCategoryTransferGroupId = `legacy_cat_pro_labore_${Date.now()}`;
    await prisma.transaction.createMany({
      data: [
        {
          workspaceId: wsOverview.workspace.id,
          entityId: pfEntity.id,
          type: 'despesa',
          direction: 'out',
          amount: 250,
          description: 'Transferência legada PF com categoria pro-labore OUT',
          transactionDate: new Date('2026-10-03'),
          transferGroupId: legacyCategoryTransferGroupId,
          transferType: null,
          status: 'confirmado',
        },
        {
          workspaceId: wsOverview.workspace.id,
          entityId: pfEntity.id,
          categoryId: proLaboreCategory?.id ?? null,
          type: 'receita',
          direction: 'in',
          amount: 250,
          description: 'Transferência legada PF com categoria pro-labore IN',
          transactionDate: new Date('2026-10-03'),
          transferGroupId: legacyCategoryTransferGroupId,
          transferType: null,
          status: 'confirmado',
        },
      ],
    });

    // Execute the real migration SQL file, extracting ONLY the UPDATE statements
    const migrationFilePath = path.resolve(
      __dirname,
      '../prisma/migrations/20261106003200_backfill_transfer_type_enum/migration.sql'
    );
    const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

    // Split statements by semicolon, strip comments, filter only UPDATE statements
    const updateStatements = migrationSql
      .split(';')
      .map((stmt) => stmt.replace(/--.*$/gm, '').trim())
      .filter((stmt) => stmt.toUpperCase().startsWith('UPDATE'));

    expect(updateStatements.length).toBeGreaterThanOrEqual(3);

    for (const stmt of updateStatements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    const backfilledProLabore = await prisma.transaction.findFirst({
      where: { transferGroupId: legacyTransferGroupId, direction: 'out' },
    });
    const backfilledAccountTransfer = await prisma.transaction.findFirst({
      where: { transferGroupId: legacyAccountTransferGroupId, direction: 'out' },
    });
    const backfilledCategoryProLabore = await prisma.transaction.findFirst({
      where: { transferGroupId: legacyCategoryTransferGroupId, direction: 'out' },
    });

    expect(backfilledProLabore?.transferType).toBe('pro_labore');
    expect(backfilledAccountTransfer?.transferType).toBe('transfer');
    expect(backfilledCategoryProLabore?.transferType).toBe('pro_labore');
  });
});
