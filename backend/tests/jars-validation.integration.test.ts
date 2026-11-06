import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { provisionWorkspace } from '../src/modules/workspace/public.js';

describe('Jars Validation Hardening (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;
  let entityId: string;

  beforeAll(async () => {
    app = await buildApp();

    let user = await prisma.user.findFirst({ where: { email: 'jars-val@test.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Jars Val User',
          email: 'jars-val@test.local',
          passwordHash: 'dummy',
          accountType: 'mei',
        },
      });
    }

    const prov = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace Jars Val',
    });
    workspaceId = prov.workspaceId;
    entityId = prov.pfEntityId;

    token = app.jwt.sign(
      { sub: user.id, userId: user.id, email: user.email, wid: workspaceId },
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita POST /api/jars/plan com baseMode numérico com 400 VALIDATION_ERROR (corrige 500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jars/plan',
      headers: { authorization: `Bearer ${token}` },
      payload: { baseMode: 123 },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Base de cálculo inválida. Use mes_atual, mes_anterior ou media_3_meses');
  });

  it('rejeita PUT /api/jars/categories com IDs não-UUID com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: { categoryId: 'not-uuid', jarId: 'not-uuid' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('cria plano de potes com payload válido com sucesso', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jars/plan',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        entityId,
        templateSlug: 'seis-potes',
        baseMode: 'mes_atual',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.active).toBe(true);
  });
});
