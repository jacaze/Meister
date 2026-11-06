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
});
