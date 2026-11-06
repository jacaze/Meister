import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { provisionWorkspace } from '../src/modules/workspace/public.js';

describe('Ledger Validation Hardening (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;
  let accountIdA: string;
  let accountIdB: string;

  beforeAll(async () => {
    app = await buildApp();

    let user = await prisma.user.findFirst({ where: { email: 'ledger-val@test.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Ledger Val User',
          email: 'ledger-val@test.local',
          passwordHash: 'dummy',
          accountType: 'mei',
        },
      });
    }

    const prov = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace Ledger Val',
    });
    workspaceId = prov.workspaceId;

    // Criar contas financeiras para teste de transferências
    const accA = await prisma.financialAccount.create({
      data: {
        workspaceId,
        entityId: prov.pjEntityId!,
        name: 'Conta PJ 1',
        kind: 'checking',
      },
    });
    const accB = await prisma.financialAccount.create({
      data: {
        workspaceId,
        entityId: prov.pjEntityId!,
        name: 'Conta PJ 2',
        kind: 'checking',
      },
    });
    accountIdA = accA.id;
    accountIdB = accB.id;

    token = app.jwt.sign(
      { sub: user.id, userId: user.id, email: user.email, wid: workspaceId },
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita POST /api/transfers com contas inválidas (não UUID) com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fromAccountId: 'nao-e-uuid',
        toAccountId: accountIdB,
        amount: 100,
        occurredOn: '2026-03-01',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'fromAccountId' })])
    );
  });

  it('rejeita POST /api/owner-withdrawals com valor inválido com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/owner-withdrawals',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        amount: -50,
        occurredOn: '2026-03-01',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('aceita POST /api/transfers com payload válido e formato correto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fromAccountId: accountIdA,
        toAccountId: accountIdB,
        amount: 25.5,
        occurredOn: '2026-03-01',
        description: 'Transferência legítima de teste',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.transferGroupId).toBeDefined();
    expect(body.legOut).toBeDefined();
    expect(body.legIn).toBeDefined();
  });

  it('valida POST /api/transactions e PUT /api/transactions/:id via Zod rejeitando corpos malformados com 400 VALIDATION_ERROR', async () => {
    const badPostArray = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: [],
    });
    expect(badPostArray.statusCode).toBe(400);
    expect(badPostArray.json().code).toBe('VALIDATION_ERROR');

    const badPostTypes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        description: 123,
        amount: { invalid: true },
        type: 'invalido',
        categoryId: null,
        transactionDate: 123,
      },
    });
    expect(badPostTypes.statusCode).toBe(400);
    expect(badPostTypes.json().code).toBe('VALIDATION_ERROR');

    const badPutArray = await app.inject({
      method: 'PUT',
      url: '/api/transactions/00000000-0000-4000-8000-000000000000',
      headers: { authorization: `Bearer ${token}` },
      payload: [],
    });
    expect(badPutArray.statusCode).toBe(400);
    expect(badPutArray.json().code).toBe('VALIDATION_ERROR');
  });
});
