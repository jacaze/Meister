import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

function generateUniqueCnpj(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 9));
  const base = [...n, 0, 0, 0, 1];
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s1 = 0;
  for (let i = 0; i < 12; i++) s1 += base[i]! * w1[i]!;
  const r1 = s1 % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  base.push(d1);
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s2 = 0;
  for (let i = 0; i < 13; i++) s2 += base[i]! * w2[i]!;
  const r2 = s2 % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;
  base.push(d2);
  const raw = base.join('');
  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12, 14)}`;
}

describe('Workspace Profile Frontend Payload Integration (Reprodução de Falha)', () => {
  let app: FastifyInstance;
  let token: string;
  let entityId: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const email = `profile_user_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: {
        name: 'Profile Tester',
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

    const user = await prisma.user.findUnique({ where: { email } });
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: user!.id },
    });
    const entity = await prisma.entity.findFirst({
      where: { workspaceId: member!.workspaceId, isMei: true },
    });
    entityId = entity!.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('🔴 PROVA DO BUG: salvar perfil sem nome fantasia (tradeName: null) e sem razão social (legalName: null) deve ter sucesso 2xx', async () => {
    // Payload exato montado por frontend/src/pages/ProfilePage.tsx:139:
    // legalName: legalName.trim() || null
    // tradeName: tradeName.trim() || null
    const frontendPayload = {
      cnpj: generateUniqueCnpj(),
      legalName: null,
      tradeName: null,
      openedOn: '2021-05-10',
      activity: 'servicos',
    };

    const res = await app.inject({
      method: 'PUT',
      url: `/api/entities/${entityId}/business-profile`,
      headers: { authorization: `Bearer ${token}` },
      payload: frontendPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(entityId);
    expect(body.tradeName).toBeNull();
  });
});
