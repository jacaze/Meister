import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { provisionWorkspace } from '../src/modules/workspace/public.js';

describe('OpenFinance Validation Hardening (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;

  beforeAll(async () => {
    app = await buildApp();

    let user = await prisma.user.findFirst({ where: { email: 'of-val@test.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'OF Val User',
          email: 'of-val@test.local',
          passwordHash: 'dummy',
          accountType: 'mei',
        },
      });
    }

    const prov = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace OF Val',
    });
    workspaceId = prov.workspaceId;

    token = app.jwt.sign(
      { sub: user.id, userId: user.id, email: user.email, wid: workspaceId },
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita POST /api/imports/approve com bankTransactionId não-UUID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: { authorization: `Bearer ${token}` },
      payload: { bankTransactionId: 'invalid-id' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'bankTransactionId' })])
    );
  });

  it('rejeita POST /api/imports/batch-approve com itens não-UUID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/batch-approve',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [{ bankTransactionId: 'not-a-uuid' }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita POST /api/openfinance/connect-item com entityId inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/openfinance/connect-item',
      headers: { authorization: `Bearer ${token}` },
      payload: { itemId: 'item_123', entityId: 'not-uuid' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('aprova transação importada com descrição longa de extrato (300 caracteres) sem quebrar contrato com 400', async () => {
    const longMemo = `PIX RECEBIDO CLIENTE CONTRATO ANUAL DE PRESTACAO DE SERVICOS DE MANUTENCAO E CONSULTORIA TECNICA ESPECIALIZADA EM INFRAESTRUTURA E REDES CORPORATIVAS - PARCELA 01/12 - IDENTIFICADOR BANCARIO E2E99887766554433221100 - DOCUMENTO FISCAL VINCULADO E CONFERIDO PELO DEPARTAMENTO FINANCEIRO CENTRAL ${'X'.repeat(40)}`;
    expect(longMemo.length).toBeGreaterThanOrEqual(300);

    await prisma.category.create({
      data: {
        workspaceId,
        name: `Receita OF ${Date.now()}`,
        slug: `receita-of-${Date.now()}`,
        type: 'receita',
      },
    });

    const ofx = `
OFXHEADER:100
<OFX>
  <STMTTRN>
    <TRNTYPE>CREDIT</TRNTYPE>
    <DTPOSTED>20261104120000</DTPOSTED>
    <TRNAMT>1250.00</TRNAMT>
    <FITID>FIT-LONG-${Date.now()}</FITID>
    <MEMO>${longMemo}</MEMO>
  </STMTTRN>
</OFX>`;

    const impRes = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: { authorization: `Bearer ${token}` },
      payload: { content: ofx, provider: 'ofx', institution: 'Banco Teste' },
    });
    expect(impRes.statusCode).toBe(201);

    const inboxRes = await app.inject({
      method: 'GET',
      url: '/api/imports',
      headers: { authorization: `Bearer ${token}` },
    });
    const importedItem = inboxRes.json().items[0] as { id: string; description: string };
    expect(importedItem.description.length).toBeGreaterThanOrEqual(300);

    const approveRes = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: { authorization: `Bearer ${token}` },
      payload: { bankTransactionId: importedItem.id },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().description).toBe(longMemo);
  });
});
