import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { getMeiLimit } from '../src/modules/fiscal/application/use-cases/GetMeiLimit.js';
import { createTransfer } from '../src/modules/ledger/public.js';
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
});
