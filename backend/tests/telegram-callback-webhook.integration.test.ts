import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Telegram Callback Query Webhook Integration (Reprodução de Falha)', () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;
  let workspaceId: string;
  const fakeChatId = `chat_cb_${Date.now()}`;
  const webhookSecret = 'test_webhook_secret_telegram_32_chars_long';

  beforeAll(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = webhookSecret;
    app = await buildApp({ logger: false });
    await app.ready();

    const email = `tg_cb_${Date.now()}@test.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Telegram User',
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
    token = loginRes.json().token as string;

    const user = await prisma.user.findUnique({ where: { email } });
    userId = user!.id;
    const member = await prisma.workspaceMember.findFirst({
      where: { userId },
    });
    workspaceId = member!.workspaceId;

    // Vincula chat do telegram via link-token e /start
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/telegram/link-token',
      headers: { authorization: `Bearer ${token}` },
    });
    const { token: linkToken } = tokenRes.json();

    const linkRes = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      payload: {
        update_id: Math.floor(Math.random() * 1000000),
        message: {
          message_id: 1,
          from: { id: 123456, is_bot: false, first_name: 'Maria' },
          chat: { id: fakeChatId, type: 'private' },
          text: `/start ${linkToken}`,
        },
      },
    });
    expect(linkRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('🔴 PROVA DO BUG: clique em Confirmar no Telegram deve confirmar a proposta via webhook', async () => {
    // 1. Cria proposta aberta
    const proposal = await prisma.proposal.create({
      data: {
        workspaceId,
        userId,
        draft: {
          type: 'receita',
          amount: '120.00',
          description: 'Venda de bolo',
          occurredOn: new Date().toISOString().slice(0, 10),
        },
        confidence: 0.95,
        status: 'aberta',
        source: 'texto',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // 2. Dispara webhook do Telegram pela rota /api/telegram/webhook com callback_query contendo message real
    const webhookRes = await app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
      payload: {
        update_id: Math.floor(Math.random() * 1000000),
        callback_query: {
          id: 'cb_query_test_1',
          from: { id: 123456, is_bot: false, first_name: 'Maria' },
          data: `p:${proposal.id}:c`,
          message: {
            message_id: 99,
            chat: { id: fakeChatId, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: 'Proposta de lançamento...',
          },
        },
      },
    });

    expect(webhookRes.statusCode).toBe(200);

    // 3. Prova que a proposta foi confirmada e a transação foi gravada no ledger
    const updatedProposal = await prisma.proposal.findUnique({
      where: { id: proposal.id },
    });

    expect(updatedProposal?.status).toBe('confirmada');

    const tx = await prisma.transaction.findFirst({
      where: {
        workspaceId,
        sourceRef: `proposal:${proposal.id}`,
      },
    });
    expect(tx).not.toBeNull();
    expect(Number(tx?.amount)).toBe(120.0);
  });
});
