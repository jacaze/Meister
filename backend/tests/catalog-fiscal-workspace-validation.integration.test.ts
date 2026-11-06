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
    entityId = prov.pjEntityId!;

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

  it('valida rotas de Auth, User, Insights, Education e Compliance contra payloads malformados com 400 VALIDATION_ERROR', async () => {
    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: [],
    });
    expect(badLogin.statusCode).toBe(400);
    expect(badLogin.json().code).toBe('VALIDATION_ERROR');

    const badRegister = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: '', email: 'invalido', password: '' },
    });
    expect(badRegister.statusCode).toBe(400);
    expect(badRegister.json().code).toBe('VALIDATION_ERROR');

    const badPatchMe = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { accountType: 'empresa_sa' },
    });
    expect(badPatchMe.statusCode).toBe(400);
    expect(badPatchMe.json().code).toBe('VALIDATION_ERROR');

    const badInsightsAsk = await app.inject({
      method: 'POST',
      url: '/api/insights/ask',
      headers: { authorization: `Bearer ${token}` },
      payload: { question: '   ' },
    });
    expect(badInsightsAsk.statusCode).toBe(400);
    expect(badInsightsAsk.json().code).toBe('VALIDATION_ERROR');

    const badInsightsFeedback = await app.inject({
      method: 'POST',
      url: '/api/insights/00000000-0000-4000-8000-000000000000/feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 'talvez' },
    });
    expect(badInsightsFeedback.statusCode).toBe(400);
    expect(badInsightsFeedback.json().code).toBe('VALIDATION_ERROR');

    const badEduQuiz = await app.inject({
      method: 'POST',
      url: '/api/education/lessons/separar-pf-pj/quiz',
      headers: { authorization: `Bearer ${token}` },
      payload: { answers: ['a'] },
    });
    expect(badEduQuiz.statusCode).toBe(400);
    expect(badEduQuiz.json().code).toBe('VALIDATION_ERROR');

    const badConsent = await app.inject({
      method: 'POST',
      url: '/api/consents',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'invalido', accepted: 'sim' },
    });
    expect(badConsent.statusCode).toBe(400);
    expect(badConsent.json().code).toBe('VALIDATION_ERROR');
  });
});
