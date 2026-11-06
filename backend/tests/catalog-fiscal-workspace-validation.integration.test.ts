import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { provisionWorkspace } from '../src/modules/workspace/public.js';

describe('Catalog, Fiscal & Workspace Validation Hardening (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;
  let entityId: string;

  beforeAll(async () => {
    app = await buildApp();

    let user = await prisma.user.findFirst({ where: { email: 'cfw-val@test.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'CFW Val User',
          email: 'cfw-val@test.local',
          passwordHash: 'dummy',
          accountType: 'mei',
        },
      });
    }

    const prov = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace CFW Val',
    });
    workspaceId = prov.workspaceId;
    entityId = prov.pjEntityId;

    token = app.jwt.sign(
      { sub: user.id, userId: user.id, email: user.email, wid: workspaceId },
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita POST /api/categories com tipo inválido com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Investimento', type: 'invalido' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita POST /api/das/:id/pay sem data de pagamento com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/das/00000000-0000-0000-0000-000000000000/pay',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita PUT /api/entities/:id/business-profile com estado de mais de 2 letras com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/entities/${entityId}/business-profile`,
      headers: { authorization: `Bearer ${token}` },
      payload: { state: 'SAO_PAULO' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
