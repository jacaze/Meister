import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Assistant & Telegram Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let email: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    email = `asst_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Maria MEI Designer',
        email,
        password: 'Password123!',
        accountType: 'mei',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    token = loginRes.json().token as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('generates a financial proposal from natural language text and confirms it into the ledger', async () => {
    // 1. Send natural language text
    const propRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/proposals',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        text: 'Recebi 1800 de desenvolvimento de logotipo via pix hoje',
      },
    });

    expect(propRes.statusCode).toBe(200);
    const propBody = propRes.json();
    expect(propBody.kind).toBe('proposal');
    expect(propBody.proposalId).toBeDefined();
    expect(propBody.draft.type).toBe('receita');
    expect(propBody.draft.amount).toBe('1800.00');

    // 2. Confirm the proposal
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/assistant/proposals/${propBody.proposalId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(confirmRes.statusCode).toBe(200);
    const confirmBody = confirmRes.json();
    expect(confirmBody.transactionId).toBeDefined();
    expect(confirmBody.amount).toBe('1800.00');

    // 3. Verify in database that transaction was written to ledger
    const tx = await prisma.transaction.findUnique({
      where: { id: confirmBody.transactionId },
    });
    expect(tx).not.toBeNull();
    expect(Number(tx?.amount)).toBe(1800.0);
    expect(tx?.sourceRef).toBe(`proposal:${propBody.proposalId}`);

    // 4. Test idempotency: confirming again returns same transaction
    const secondConfirmRes = await app.inject({
      method: 'POST',
      url: `/api/assistant/proposals/${propBody.proposalId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(secondConfirmRes.statusCode).toBe(200);
    expect(secondConfirmRes.json().transactionId).toBe(confirmBody.transactionId);
  });

  it('generates a link token and links a Telegram chat via simulated webhook', async () => {
    // 1. Create link token
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/telegram/link-token',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tokenRes.statusCode).toBe(201);
    const { token: linkToken, botUrl } = tokenRes.json();
    expect(linkToken).toBeDefined();
    expect(botUrl).toContain('https://t.me/');

    // 2. Check status before linking
    const statusBefore = await app.inject({
      method: 'GET',
      url: '/api/telegram/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(statusBefore.json().linked).toBe(false);

    // 3. Send /start <token> update via webhook
    const fakeChatId = `chat_${Date.now()}`;
    const webhookRes = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
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
    expect(webhookRes.statusCode).toBe(200);

    // 4. Verify status after linking
    const statusAfter = await app.inject({
      method: 'GET',
      url: '/api/telegram/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(statusAfter.json().linked).toBe(true);
    expect(statusAfter.json().chatId).toBe(fakeChatId);

    // 5. Send command /saldo via webhook
    const saldoRes = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      payload: {
        update_id: Math.floor(Math.random() * 1000000),
        message: {
          message_id: 2,
          from: { id: 123456, is_bot: false },
          chat: { id: fakeChatId, type: 'private' },
          text: '/saldo',
        },
      },
    });
    expect(saldoRes.statusCode).toBe(200);
  });

  it('checks assistant config and processes conversational chat', async () => {
    // 1. Get config
    const configRes = await app.inject({
      method: 'GET',
      url: '/api/assistant/config',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(configRes.statusCode).toBe(200);
    expect(configRes.json()).toHaveProperty('hasApiKey');
    expect(configRes.json()).toHaveProperty('model');

    // 2. Chat with proposal intent
    const chatPropRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/chat',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        message: 'Gastei 55 no almoço de hoje',
      },
    });
    expect(chatPropRes.statusCode).toBe(200);
    const chatProp = chatPropRes.json();
    expect(chatProp.kind).toBe('proposal');
    expect(chatProp.proposal.amount).toBe('55.00');
    expect(chatProp.proposal.type).toBe('despesa');
    expect(chatProp.reply).toContain('55,00');

    // 3. Chat with finance query
    const chatFinRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/chat',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        message: 'Qual é o meu saldo?',
      },
    });
    expect(chatFinRes.statusCode).toBe(200);
    const chatFin = chatFinRes.json();
    expect(chatFin.kind).toBe('finance_query');
    expect(chatFin.reply).toContain('saldo');

    // 4. Chat with education query
    const chatEduRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/chat',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        message: 'Como funciona o limite MEI?',
      },
    });
    expect(chatEduRes.statusCode).toBe(200);
    const chatEdu = chatEduRes.json();
    expect(['education', 'general', 'finance_query']).toContain(chatEdu.kind);
    expect(chatEdu.reply.length).toBeGreaterThan(10);
  });
});
