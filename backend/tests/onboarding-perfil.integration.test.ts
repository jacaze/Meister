import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Tarefa 17: depois do cadastro o app pergunta o caso (sozinho, negócio, família, família com negócio)
// e cria as entidades. Autônomo é atividade separada da PF, sem regras de MEI.

interface Session {
  token: string;
  userId: string;
}

describe('Onboarding por perfil', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  let seq = 0;

  async function signUp(accountType?: 'mei' | 'pessoa_fisica'): Promise<Session> {
    seq += 1;
    const email = `perfil_${seq}_${runId}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: `Pessoa ${seq}`, email, password: 'Password123!', ...(accountType ? { accountType } : {}) },
    });
    expect(reg.statusCode).toBe(201);
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    return { token: login.json().token as string, userId };
  }

  function call(s: Session, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) {
    return app.inject({ method, url, headers: { authorization: `Bearer ${s.token}` }, payload: payload as never });
  }

  async function overview(s: Session) {
    const res = await call(s, 'GET', '/api/workspace');
    expect(res.statusCode).toBe(200);
    return res.json() as {
      workspace: { profile: string | null; onboardingCompleted: boolean };
      entities: Array<{ id: string; kind: string; name: string; isMei: boolean; ownerUserId: string | null }>;
    };
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('cadastro sem accountType deixa o onboarding pendente, só com a PF', async () => {
    const s = await signUp();
    const ov = await overview(s);

    expect(ov.workspace.onboardingCompleted).toBe(false);
    expect(ov.workspace.profile).toBeNull();
    expect(ov.entities.map((e) => e.kind)).toEqual(['pf']);
    expect(ov.entities[0]!.ownerUserId).toBe(s.userId);
  });

  it('cadastro com accountType (clientes antigos) já sai configurado', async () => {
    const mei = await overview(await signUp('mei'));
    expect(mei.workspace).toMatchObject({ profile: 'negocio', onboardingCompleted: true });

    const pf = await overview(await signUp('pessoa_fisica'));
    expect(pf.workspace).toMatchObject({ profile: 'individual', onboardingCompleted: true });
  });

  it('pessoa sozinha: só a PF e conta pessoa física', async () => {
    const s = await signUp();
    const res = await call(s, 'POST', '/api/onboarding', { profile: 'individual', businesses: [] });

    expect(res.statusCode).toBe(200);
    const ov = await overview(s);
    expect(ov.workspace).toMatchObject({ profile: 'individual', onboardingCompleted: true });
    expect(ov.entities.map((e) => e.kind)).toEqual(['pf']);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).accountType).toBe('pessoa_fisica');
  });

  it('autônomo: entidade separada, com dono, sem MEI e sem DAS', async () => {
    const s = await signUp();
    const res = await call(s, 'POST', '/api/onboarding', {
      profile: 'negocio',
      businesses: [{ type: 'autonomo', name: 'Design freelance' }],
    });

    expect(res.statusCode).toBe(200);
    const ov = await overview(s);
    const autonomo = ov.entities.find((e) => e.kind === 'autonomo')!;
    expect(autonomo).toMatchObject({ name: 'Design freelance', isMei: false, ownerUserId: s.userId });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).accountType).toBe('pessoa_fisica');
    expect(await prisma.dasCharge.count({ where: { entityId: autonomo.id } })).toBe(0);
    const das = await call(s, 'GET', `/api/das?entityId=${autonomo.id}`);
    expect(das.json().items).toEqual([]);
  });

  it('casal com negócios: MEI e autônomo; só o MEI entra nas regras fiscais', async () => {
    const s = await signUp();
    const res = await call(s, 'POST', '/api/onboarding', {
      profile: 'familia_negocio',
      businesses: [
        { type: 'mei', name: 'Clínica' },
        { type: 'autonomo', name: 'Consultoria' },
      ],
    });

    expect(res.statusCode).toBe(200);
    const ov = await overview(s);
    expect(ov.workspace.profile).toBe('familia_negocio');
    const mei = ov.entities.find((e) => e.kind === 'pj')!;
    expect(mei).toMatchObject({ name: 'Clínica', isMei: true, ownerUserId: s.userId });
    expect(ov.entities.filter((e) => e.kind === 'autonomo')).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).accountType).toBe('mei');
    const limit = await call(s, 'GET', `/api/mei/limit?entityId=${mei.id}`);
    expect(limit.statusCode).toBe(200);
  });

  it('refazer o onboarding adiciona negócios sem duplicar nem apagar os existentes', async () => {
    const s = await signUp();
    await call(s, 'POST', '/api/onboarding', { profile: 'negocio', businesses: [{ type: 'pj', name: 'Loja' }] });
    const again = await call(s, 'POST', '/api/onboarding', {
      profile: 'negocio',
      businesses: [{ type: 'autonomo', name: 'Aulas' }],
    });

    expect(again.statusCode).toBe(200);
    const kinds = (await overview(s)).entities.map((e) => e.kind).sort();
    expect(kinds).toEqual(['autonomo', 'pf', 'pj']);
  });

  it('perfil com negócio exige ao menos um negócio; tipo desconhecido é recusado', async () => {
    const s = await signUp();

    expect((await call(s, 'POST', '/api/onboarding', { profile: 'negocio', businesses: [] })).statusCode).toBe(400);
    expect(
      (await call(s, 'POST', '/api/onboarding', { profile: 'negocio', businesses: [{ type: 'ong', name: 'X' }] })).statusCode
    ).toBe(400);
    expect((await overview(s)).workspace.onboardingCompleted).toBe(false);
  });

  it('arquivar negócio desativa sem apagar; PF não arquiva; negócio de outro workspace é 404', async () => {
    const s = await signUp();
    const outro = await signUp();
    await call(s, 'POST', '/api/onboarding', { profile: 'negocio', businesses: [{ type: 'autonomo', name: 'Fotos' }] });
    await call(outro, 'POST', '/api/onboarding', { profile: 'negocio', businesses: [{ type: 'autonomo', name: 'Bolos' }] });
    const ov = await overview(s);
    const autonomo = ov.entities.find((e) => e.kind === 'autonomo')!;
    const pf = ov.entities.find((e) => e.kind === 'pf')!;
    const negocioDoOutro = (await overview(outro)).entities.find((e) => e.kind === 'autonomo')!;

    expect((await call(s, 'DELETE', `/api/workspace/businesses/${negocioDoOutro.id}`)).statusCode).toBe(404);
    expect((await call(s, 'DELETE', `/api/workspace/businesses/${pf.id}`)).statusCode).toBe(400);
    expect((await call(s, 'DELETE', `/api/workspace/businesses/${autonomo.id}`)).statusCode).toBe(200);

    expect((await overview(s)).entities.map((e) => e.kind)).toEqual(['pf']);
    expect((await prisma.entity.findUniqueOrThrow({ where: { id: autonomo.id } })).active).toBe(false);
    expect((await prisma.entity.findUniqueOrThrow({ where: { id: negocioDoOutro.id } })).active).toBe(true);
  });
});
