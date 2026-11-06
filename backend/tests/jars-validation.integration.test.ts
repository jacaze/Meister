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

  it('cria plano de potes com payload válido e NUNCA apaga ou desativa o plano ativo quando POST /api/jars/plan recebe corpo malformado (regressão P0)', async () => {
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
    const activePlan = res.json();
    expect(activePlan.id).toBeDefined();
    expect(activePlan.active).toBe(true);
    expect(activePlan.jars).toHaveLength(6);

    // Vincula uma categoria ao primeiro pote para garantir que vínculos não são perdidos
    const cat = await prisma.category.create({
      data: {
        workspaceId,
        name: `Cat Pote ${Date.now()}`,
        slug: `cat-pote-${Date.now()}`,
        type: 'despesa',
      },
    });
    const firstJarId = activePlan.jars[0].id as string;

    const mapRes = await app.inject({
      method: 'PUT',
      url: '/api/jars/categories',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planId: activePlan.id,
        jarId: firstJarId,
        categoryIds: [cat.id],
      },
    });
    expect(mapRes.statusCode).toBe(200);

    // Envia corpos malformados que na develop retornavam 201 (apagando o plano ativo) ou 500
    const malformedBodies: Array<{ raw?: string; payload?: unknown; contentType?: string }> = [
      { payload: [] },
      { payload: {} },
      { raw: 'null' },
      { raw: 'texto solto', contentType: 'text/plain' },
      { payload: { baseMode: 123 } },
      { payload: { baseMode: 'invalido' } },
      { payload: { templateSlug: 'template-inexistente' } },
    ];

    for (const bad of malformedBodies) {
      const badRes = await app.inject({
        method: 'POST',
        url: '/api/jars/plan',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': bad.contentType ?? 'application/json',
        },
        payload: bad.raw ?? JSON.stringify(bad.payload),
      });
      expect(badRes.statusCode).toBe(400);
      expect(badRes.json().code).toBe('VALIDATION_ERROR');
    }

    // O plano original DEVE continuar ativo no banco e com os 6 potes e categoria vinculada intactos
    const planInDb = await prisma.jarPlan.findUnique({
      where: { id: activePlan.id },
      include: { jars: true, categories: true },
    });
    expect(planInDb?.active).toBe(true);
    expect(planInDb?.jars).toHaveLength(6);
    expect(planInDb?.categories.some((c) => c.categoryId === cat.id && c.jarId === firstJarId)).toBe(true);
  });
});
