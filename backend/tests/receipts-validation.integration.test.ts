import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { provisionWorkspace } from '../src/modules/workspace/public.js';

describe('Receipts Validation Hardening (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;

  beforeAll(async () => {
    app = await buildApp();

    let user = await prisma.user.findFirst({ where: { email: 'rcpt-val@test.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Rcpt Val User',
          email: 'rcpt-val@test.local',
          passwordHash: 'dummy',
          accountType: 'mei',
        },
      });
    }

    const prov = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace Rcpt Val',
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

  it('rejeita POST /api/receipts/confirm com categoryId inválido (não-UUID)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/receipts/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        total: '100.00',
        categoryId: 'not-a-uuid',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'categoryId' })])
    );
  });

  it('rejeita POST /api/receipts/parse com entityId inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/receipts/parse',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        entityId: 'invalido',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
