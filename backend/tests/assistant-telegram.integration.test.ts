import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Assistant & Telegram Integration', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Authenticate with seeded user
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'demo@meister.com',
        password: 'Senha123@',
      },
    });

    const body = JSON.parse(res.body);
    token = body.token;
    userId = body.user.id;
    workspaceId = body.user.workspaces[0].workspaceId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a telegram link token and retrieves status', async () => {
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/telegram/link-token',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(tokenRes.statusCode).toBe(200);
    const tokenBody = JSON.parse(tokenRes.body);
    expect(tokenBody.token).toBeDefined();
    expect(tokenBody.token.length).toBeGreaterThan(20);

    const statusRes = await app.inject({
      method: 'GET',
      url: '/telegram/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.isLinked).toBe(false);
  });

  it('processes text proposal and allows confirmation through HTTP API', async () => {
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/assistant/propose-text',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        text: 'Gastei 55 reais no almoço hoje',
      },
    });

    expect(proposeRes.statusCode).toBe(200);
    const proposal = JSON.parse(proposeRes.body);
    expect(proposal.kind).toBe('proposal');
    expect(proposal.proposalId).toBeDefined();
    expect(proposal.draft.amount).toBe('55.00');

    // Confirm proposal
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/assistant/proposals/${proposal.proposalId}/confirm`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(confirmRes.statusCode).toBe(200);
    const confirmed = JSON.parse(confirmRes.body);
    expect(confirmed.transactionId).toBeDefined();
    expect(confirmed.amount).toBe('55.00');
  });
});
