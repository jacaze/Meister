import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { parseEnv } from '../src/shared/index.js';

// Atrás do Caddy, todo pedido chega com o IP do proxy. Com o proxy em TRUST_PROXY a API usa o IP real
// (último salto do X-Forwarded-For); sem ele, rate limit e IP do consentimento ficam errados.
// O inject chega de 127.0.0.1, então "loopback" faz o papel do Caddy.
const RATE_LIMIT_MAX = 300;

async function appWith(trustProxy: string | undefined): Promise<FastifyInstance> {
  const raw = { ...process.env };
  if (trustProxy === undefined) delete raw.TRUST_PROXY;
  else raw.TRUST_PROXY = trustProxy;
  const app = await buildApp({ env: parseEnv(raw), logger: false });
  await app.ready();
  return app;
}

function health(app: FastifyInstance, forwardedFor: string) {
  return app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': forwardedFor } });
}

async function exhaustLimit(app: FastifyInstance, forwardedFor: string) {
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    const res = await health(app, forwardedFor);
    expect(res.statusCode).toBe(200);
  }
}

describe('TRUST_PROXY — IP real do cliente atrás do proxy', () => {
  const opened: FastifyInstance[] = [];
  let token = '';
  let userId = '';

  async function open(trustProxy: string | undefined) {
    const app = await appWith(trustProxy);
    opened.push(app);
    return app;
  }

  beforeAll(async () => {
    const app = await open(undefined);
    const email = `trust_proxy_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Tina Proxy', email, password: 'Password123!', accountType: 'mei' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email, password: 'Password123!' },
    });
    token = login.json().token as string;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  });

  afterAll(async () => {
    for (const app of opened) await app.close();
    await prisma.$disconnect();
  });

  it('com o proxy em TRUST_PROXY, clientes diferentes atrás do proxy não dividem o rate limit', async () => {
    const app = await open('loopback');
    await exhaustLimit(app, '203.0.113.10');

    expect((await health(app, '203.0.113.10')).statusCode).toBe(429);
    expect((await health(app, '198.51.100.20')).statusCode).toBe(200);
  });

  it('sem TRUST_PROXY, X-Forwarded-For forjado não escapa do rate limit', async () => {
    const app = await open(undefined);
    await exhaustLimit(app, '203.0.113.10');

    expect((await health(app, '198.51.100.20')).statusCode).toBe(429);
  });

  async function consentIp(trustProxy: string | undefined, forwardedFor: string) {
    const app = await open(trustProxy);
    const res = await app.inject({
      method: 'POST',
      url: '/api/consents',
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': forwardedFor },
      payload: { kind: 'privacy', version: `tp-${trustProxy ?? 'off'}-${Date.now()}`, accepted: true },
    });
    expect(res.statusCode).toBeLessThan(300);
    const consent = await prisma.userConsent.findFirstOrThrow({
      where: { userId, kind: 'privacy' },
      orderBy: { createdAt: 'desc' },
    });
    return consent.ipAddress;
  }

  it('com o proxy em TRUST_PROXY, o consentimento grava o IP posto pelo proxy, não o forjado pelo cliente', async () => {
    expect(await consentIp('loopback', '6.6.6.6, 203.0.113.10')).toBe('203.0.113.10');
  });

  it('sem TRUST_PROXY, o consentimento ignora X-Forwarded-For', async () => {
    expect(await consentIp(undefined, '6.6.6.6')).toBe('127.0.0.1');
  });
});
