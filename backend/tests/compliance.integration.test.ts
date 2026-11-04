import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Compliance & LGPD Integration Suite (PostgreSQL 16)', () => {
  let app: FastifyInstance;
  let token: string;
  let email: string;
  const password = 'Password123!';

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    email = `lgpd_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Julia MEI Artesanato',
        email,
        password,
        accountType: 'mei',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password },
    });
    token = loginRes.json().token as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('records consents, exports complete user data without credentials, and tracks audit log', async () => {
    // 1. Record Consents
    const consentRes1 = await app.inject({
      method: 'POST',
      url: '/api/consents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'terms',
        version: '1.0',
        accepted: true,
      },
    });
    expect(consentRes1.statusCode).toBe(200);

    const consentRes2 = await app.inject({
      method: 'POST',
      url: '/api/consents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'ai_processing',
        version: '1.0',
        accepted: true,
      },
    });
    expect(consentRes2.statusCode).toBe(200);

    // 2. List Consents
    const listConsentsRes = await app.inject({
      method: 'GET',
      url: '/api/consents',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listConsentsRes.statusCode).toBe(200);
    const consents = listConsentsRes.json().consents;
    expect(consents.length).toBeGreaterThanOrEqual(2);

    // 3. Export User Data
    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/me/export',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(exportRes.statusCode).toBe(200);
    const exportData = exportRes.json();
    expect(exportData.user.email).toBe(email);
    expect(exportData.user.name).toBe('Julia MEI Artesanato');
    expect(exportData.legalDisclaimer).toContain('LGPD');
    expect(exportData.workspaces.length).toBeGreaterThanOrEqual(1);
    expect(exportData.categories.length).toBeGreaterThanOrEqual(1);
    expect(exportData.consents.length).toBeGreaterThanOrEqual(2);

    // Security Check: No sensitive passwordHash or token secrets
    const exportRaw = JSON.stringify(exportData);
    expect(exportRaw).not.toContain('passwordHash');
    expect(exportRaw).not.toContain('refreshHash');
    expect(exportRaw).not.toContain('tokenHash');

    // 4. List Audit Logs
    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/me/audit',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const logs = auditRes.json().logs;
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some((l: { action: string }) => l.action === 'compliance.export')).toBe(true);
    expect(logs.some((l: { action: string }) => l.action === 'compliance.consent')).toBe(true);
  });

  it('rejects account erasure with wrong password, and successfully anonymizes account with correct password', async () => {
    // 1. Attempt erase with incorrect password -> 401
    const failEraseRes = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { password: 'WrongPassword999!' },
    });
    expect(failEraseRes.statusCode).toBe(401);

    // 2. Attempt erase with correct password -> 200
    const passEraseRes = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { password },
    });
    expect(passEraseRes.statusCode).toBe(200);
    expect(passEraseRes.json().success).toBe(true);

    // 3. User record is anonymized and deletedAt is populated in DB
    const dbUser = await prisma.user.findFirst({
      where: { email: { startsWith: 'anon_' } },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.passwordHash).toBe('DELETED');
    expect(dbUser!.status).toBe('excluido');
    expect(dbUser!.deletedAt).not.toBeNull();
  });
});
