import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { getMeiLimit } from '../src/modules/fiscal/application/use-cases/GetMeiLimit.js';
import { createTransaction, createTransfer, deleteTransaction } from '../src/modules/ledger/public.js';
import type { WorkspaceScope } from '../src/shared/scope.js';

describe('Ledger & Transactions Hardening Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function registerAndLogin(emailPrefix: string) {
    const email = `${emailPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Usuário Teste Ledger',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });
    expect(regRes.statusCode).toBe(201);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    const token = loginRes.json().token as string;

    const wsRes = await app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: { authorization: `Bearer ${token}` },
    });
    const wsOverview = wsRes.json();
    const wsId = regRes.json().user.workspaceId as string;
    const pfEntity = wsOverview.entities.find((e: { kind: string; id: string }) => e.kind === 'pf')!;
    const pjEntity = wsOverview.entities.find((e: { kind: string; id: string }) => e.kind === 'pj')!;

    // Create 2 financial accounts (one for PF, one for PJ)
    const accPf = await prisma.financialAccount.create({
      data: {
        workspaceId: wsId,
        entityId: pfEntity.id,
        name: 'Conta Corrente PF',
        kind: 'banco',
      },
    });

    const accPj = await prisma.financialAccount.create({
      data: {
        workspaceId: wsId,
        entityId: pjEntity.id,
        name: 'Conta Corrente PJ',
        kind: 'banco',
      },
    });

    // Create default categories
    const catReceita = await prisma.category.create({
      data: {
        workspaceId: wsId,
        name: 'Vendas de Mercadoria',
        slug: `vendas-${Date.now()}`,
        type: 'receita',
      },
    });

    const catDespesa = await prisma.category.create({
      data: {
        workspaceId: wsId,
        name: 'Despesas Gerais',
        slug: `despesas-${Date.now()}`,
        type: 'despesa',
      },
    });

    const scope: WorkspaceScope = {
      workspaceId: wsId,
      actorUserId: regRes.json().user.id,
      role: 'owner',
      defaultEntityIds: {
        pf: pfEntity.id,
        pj: pjEntity.id,
      },
    };

    return { token, wsId, pfEntity, pjEntity, accPf, accPj, catReceita, catDespesa, scope };
  }

  describe('🔴 Bug 1: Transferência PF→PJ não infla faturamento MEI', () => {
    it('não deve somar transferências entre contas no faturamento do MEI', async () => {
      const u = await registerAndLogin('mei_transf');

      // Make a transfer of R$ 10,000 from PF account to PJ account
      await createTransfer(u.scope, {
        fromAccountId: u.accPf.id,
        toAccountId: u.accPj.id,
        amount: '10000.00',
        occurredOn: '2026-11-04',
        description: 'Aporte pessoal PF para PJ',
      });

      // Query MEI Limit
      const meiStatus = await getMeiLimit(u.scope, { entityId: u.pjEntity.id, year: 2026 });
      expect(meiStatus).not.toBeNull();
      // O faturamento do MEI DEVE ser 0.00, pois transferências não são faturamento comercial!
      expect(meiStatus?.faturamentoAno).toBe('0.00');
    });
  });

  describe('🟠 IDOR de Entidade em Transações Legadas', () => {
    it('deve rejeitar entityId de outro workspace no POST /api/transactions', async () => {
      const userA = await registerAndLogin('user_a');
      const userB = await registerAndLogin('user_b');

      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { authorization: `Bearer ${userA.token}` },
        payload: {
          description: 'Tentativa de IDOR de entidade',
          amount: '100.00',
          type: 'despesa',
          categoryId: userA.catDespesa.id,
          entityId: userB.pjEntity.id, // Entidade pertencente ao Workspace B!
          transactionDate: '2026-11-04',
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('🟠 Concorrência na Idempotência (CreateTransaction)', () => {
    it('deve lidar com 8 requisições simultâneas com o mesmo sourceRef sem 500/P2002', async () => {
      const u = await registerAndLogin('concurrency');
      const sourceRef = `nfe-${Date.now()}`;

      const requests = Array.from({ length: 8 }).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/transactions',
          headers: { authorization: `Bearer ${u.token}` },
          payload: {
            description: 'Confirmação concorrente NF-e',
            amount: '150.00',
            type: 'despesa',
            categoryId: u.catDespesa.id,
            sourceRef,
            transactionDate: '2026-11-04',
          },
        })
      );

      const responses = await Promise.all(requests);
      // Todas as requisições devem ser tratadas com sucesso (200 ou 201), nenhuma com 500
      for (const res of responses) {
        expect([200, 201]).toContain(res.statusCode);
      }

      // Todas devem ter retornado a MESMA transação
      const ids = responses.map((r) => r.json().id);
      expect(new Set(ids).size).toBe(1);
    });
  });

  describe('🟠 Idempotência após Soft Delete', () => {
    it('não deve retornar lançamento marcado como deletedAt ao reenviar sourceRef', async () => {
      const u = await registerAndLogin('softdelete');
      const sourceRef = `source-${Date.now()}`;

      // 1. Criar transação
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { authorization: `Bearer ${u.token}` },
        payload: {
          description: 'Lançamento original',
          amount: '75.00',
          type: 'despesa',
          categoryId: u.catDespesa.id,
          sourceRef,
          transactionDate: '2026-11-04',
        },
      });
      expect(createRes.statusCode).toBe(201);
      const txId = createRes.json().id;

      // 2. Apagar transação (soft delete)
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/transactions/${txId}`,
        headers: { authorization: `Bearer ${u.token}` },
      });
      expect(delRes.statusCode).toBe(204);

      // 3. Reenviar mesma sourceRef
      const recreateRes = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { authorization: `Bearer ${u.token}` },
        payload: {
          description: 'Lançamento recriado após exclusão',
          amount: '75.00',
          type: 'despesa',
          categoryId: u.catDespesa.id,
          sourceRef,
          transactionDate: '2026-11-04',
        },
      });
      expect([200, 201]).toContain(recreateRes.statusCode);
      const body = recreateRes.json();
      expect(body.deletedAt).toBeNull();
    });
  });

  describe('🟠 Exclusão de Transferência Apaga Ambas as Pernas', () => {
    it('deve apagar ambas as pernas quando uma transferência for excluída', async () => {
      const u = await registerAndLogin('transf_del');

      // 1. Criar transferência
      const transferRes = await app.inject({
        method: 'POST',
        url: '/api/transfers',
        headers: { authorization: `Bearer ${u.token}` },
        payload: {
          fromAccountId: u.accPf.id,
          toAccountId: u.accPj.id,
          amount: '500.00',
          occurredOn: '2026-11-04',
          description: 'Transferência para teste de exclusão',
        },
      });
      expect(transferRes.statusCode).toBe(201);
      const { legOut, legIn } = transferRes.json();

      // 2. Excluir uma das pernas via DELETE /api/transactions/:id
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/transactions/${legOut.id}`,
        headers: { authorization: `Bearer ${u.token}` },
      });
      expect(delRes.statusCode).toBe(204);

      // 3. Ambas as pernas no banco devem estar com deletedAt preenchido
      const legOutDb = await prisma.transaction.findUnique({ where: { id: legOut.id } });
      const legInDb = await prisma.transaction.findUnique({ where: { id: legIn.id } });

      expect(legOutDb?.deletedAt).not.toBeNull();
      expect(legInDb?.deletedAt).not.toBeNull();
    });
  });

  describe('🟠 Validação de Splits na Atualização via API', () => {
    it('deve rejeitar PUT amount em lançamento que possui splits com valor divergente', async () => {
      const u = await registerAndLogin('splits_put');

      // 1. Criar transação com splits diretamente via prisma
      const cat2 = await prisma.category.create({
        data: {
          workspaceId: u.wsId,
          name: 'Segunda Categoria',
          slug: `segunda-${Date.now()}`,
          type: 'despesa',
        },
      });

      const tx = await prisma.transaction.create({
        data: {
          workspaceId: u.wsId,
          entityId: u.pfEntity.id,
          type: 'despesa',
          amount: 100,
          description: 'Lançamento com divisões',
          transactionDate: new Date('2026-11-04T00:00:00.000Z'),
          status: 'confirmado',
          splits: {
            create: [
              { categoryId: u.catDespesa.id, amount: 60, position: 0 },
              { categoryId: cat2.id, amount: 40, position: 1 },
            ],
          },
        },
      });

      // 2. Tentar atualizar valor para 999
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/transactions/${tx.id}`,
        headers: { authorization: `Bearer ${u.token}` },
        payload: {
          amount: '999.00',
        },
      });

      expect(updateRes.statusCode).toBe(400);
    });
  });

  describe('🔴 P0 1: Restauração Atômica e Limpeza de Splits (N1, N2, N3)', () => {
    it('N1: restaurar lançamento dividido com categoria simples deve remover splits antigos', async () => {
      const u = await registerAndLogin('n1_splits');
      const cat2 = await prisma.category.create({
        data: {
          workspaceId: u.wsId,
          name: 'Cat 2',
          slug: `cat2-${Date.now()}`,
          type: 'despesa',
        },
      });

      const sourceRef = `nfe:N1_${Date.now()}`;
      const t1 = await createTransaction(u.scope, {
        type: 'despesa',
        amount: '100.00',
        description: 'Lançamento com splits para deletar',
        occurredOn: '2026-11-04',
        sourceRef,
        splits: [
          { categoryId: u.catDespesa.id, amount: '60.00' },
          { categoryId: cat2.id, amount: '40.00' },
        ],
      });

      await deleteTransaction(u.scope, t1.id);

      const t2 = await createTransaction(u.scope, {
        type: 'despesa',
        amount: '30.00',
        description: 'Lançamento restaurado simples',
        occurredOn: '2026-11-04',
        sourceRef,
        categoryId: u.catDespesa.id,
      });

      const splitsRestantes = await prisma.transactionSplit.findMany({
        where: { transactionId: t2.id },
      });
      expect(splitsRestantes).toHaveLength(0);
      expect(t2.categoryId).toBe(u.catDespesa.id);
      expect(Number(t2.amount)).toBe(30);
    });

    it('N2: 6 restaurações simultâneas devem ser atômicas e não multiplicar splits nem audits', async () => {
      const u = await registerAndLogin('n2_race');
      const cat2 = await prisma.category.create({
        data: {
          workspaceId: u.wsId,
          name: 'Cat N2',
          slug: `cat-n2-${Date.now()}`,
          type: 'despesa',
        },
      });

      const sourceRef = `nfe:N2_${Date.now()}`;
      const t1 = await createTransaction(u.scope, {
        type: 'despesa',
        amount: '100.00',
        description: 'Nota para restauração concorrente',
        occurredOn: '2026-11-04',
        sourceRef,
        splits: [
          { categoryId: u.catDespesa.id, amount: '60.00' },
          { categoryId: cat2.id, amount: '40.00' },
        ],
      });

      await deleteTransaction(u.scope, t1.id);

      // Dispara 6 restaurações simultâneas
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          createTransaction(u.scope, {
            type: 'despesa',
            amount: '100.00',
            description: 'Nota restaurada',
            occurredOn: '2026-11-04',
            sourceRef,
            splits: [
              { categoryId: u.catDespesa.id, amount: '60.00' },
              { categoryId: cat2.id, amount: '40.00' },
            ],
          })
        )
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(6);

      const splitsNoBanco = await prisma.transactionSplit.findMany({
        where: { transactionId: t1.id },
      });
      const somaSplits = splitsNoBanco.reduce((acc, s) => acc + Number(s.amount), 0);
      expect(somaSplits).toBe(100);
      expect(splitsNoBanco).toHaveLength(2);

      const auditsRestore = await prisma.transactionAudit.count({
        where: { transactionId: t1.id, action: 'restore' },
      });
      expect(auditsRestore).toBe(1);
    });

    it('N3: restauração pelo endpoint legado /api/transactions deve limpar splits antigos e criar audit', async () => {
      const u = await registerAndLogin('n3_legacy');
      const cat2 = await prisma.category.create({
        data: {
          workspaceId: u.wsId,
          name: 'Cat N3',
          slug: `cat-n3-${Date.now()}`,
          type: 'despesa',
        },
      });

      const sourceRef = `nfe:N3_${Date.now()}`;
      const t1 = await createTransaction(u.scope, {
        type: 'despesa',
        amount: '100.00',
        description: 'Nota para restauração legada',
        occurredOn: '2026-11-04',
        sourceRef,
        splits: [
          { categoryId: u.catDespesa.id, amount: '60.00' },
          { categoryId: cat2.id, amount: '40.00' },
        ],
      });

      await deleteTransaction(u.scope, t1.id);

      const r = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: { authorization: `Bearer ${u.token}` },
        payload: {
          description: 'Lançamento manual restaurado',
          amount: '7.00',
          type: 'despesa',
          categoryId: u.catDespesa.id,
          transactionDate: '2026-11-04',
          sourceRef,
        },
      });

      expect([200, 201]).toContain(r.statusCode);

      const splitsNoBanco = await prisma.transactionSplit.findMany({
        where: { transactionId: t1.id },
      });
      expect(splitsNoBanco).toHaveLength(0);

      const auditsRestore = await prisma.transactionAudit.count({
        where: { transactionId: t1.id, action: 'restore' },
      });
      expect(auditsRestore).toBeGreaterThanOrEqual(1);
    });
  });
});
