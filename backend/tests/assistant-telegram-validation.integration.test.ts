import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { provisionWorkspace } from '../src/modules/workspace/public.js';

describe('Assistant & Telegram Validation Hardening (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;

  beforeAll(async () => {
    app = await buildApp();

    let user = await prisma.user.findFirst({ where: { email: 'ast-val@test.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Assistant Val User',
          email: 'ast-val@test.local',
          passwordHash: 'dummy',
          accountType: 'mei',
        },
      });
    }

    const prov = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace Assistant Val',
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

  it('rejeita POST /api/assistant/chat com mensagem vazia com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assistant/chat',
      headers: { authorization: `Bearer ${token}` },
      payload: { message: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Mensagem é obrigatória.');
  });

  it('rejeita POST /api/assistant/proposals com texto vazio com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assistant/proposals',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Texto da mensagem é obrigatório.');
  });

  it('rejeita POST /api/assistant/proposals/:id/confirm com ID não-UUID com 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assistant/proposals/invalid-uuid/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('expõe o webhook público só em /telegram/webhook (sem segunda entrada sob /api)', async () => {
    expect(app.hasRoute({ method: 'POST', url: '/telegram/webhook' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/api/telegram/webhook' })).toBe(false);
  });

  it('rejeita POST /telegram/webhook com payload malformado e secret válido', async () => {
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_secret_123';

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/telegram/webhook',
        headers: {
          'x-telegram-bot-api-secret-token': 'test_secret_123',
        },
        payload: { update_id: 'not-a-number' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    } finally {
      process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
    }
  });
});
