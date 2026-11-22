import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { resolveScopeForUser } from '../src/modules/workspace/public.js';

// Família, fase 2 (docs/familia.md §3.3): o escopo diz o que cada pessoa vê. Quem usa sozinho não muda nada.

describe('Família — escopo por pessoa (fase 2)', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  let seq = 0;

  async function signUp(accountType: 'mei' | 'pessoa_fisica') {
    seq += 1;
    const email = `familia_escopo_${seq}_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: `Pessoa ${seq}`, email, password: 'Password123!', accountType },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const member = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: user.id } });
    const entities = await prisma.entity.findMany({ where: { workspaceId: member.workspaceId } });
    return { userId: user.id, workspaceId: member.workspaceId, entities };
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('quem usa sozinho vê e é dono de tudo; padrões continuam PF e PJ', async () => {
    const solo = await signUp('mei');
    const pf = solo.entities.find((e) => e.kind === 'pf')!;
    const pj = solo.entities.find((e) => e.kind === 'pj')!;

    const scope = await resolveScopeForUser(solo.userId);

    expect(scope.defaultEntityIds).toEqual({ pf: pf.id, pj: pj.id });
    expect([...scope.visibleEntityIds].sort()).toEqual([pf.id, pj.id].sort());
    expect([...scope.ownEntityIds].sort()).toEqual([pf.id, pj.id].sort());
  });

  it('casal: cada um vê o seu e a Casa; o dono do workspace não vê o pessoal do cônjuge', async () => {
    const ana = await signUp('mei');
    const joao = await signUp('pessoa_fisica');
    const anaPf = ana.entities.find((e) => e.kind === 'pf')!;
    const anaPj = ana.entities.find((e) => e.kind === 'pj')!;
    await prisma.workspaceMember.create({ data: { workspaceId: ana.workspaceId, userId: joao.userId, role: 'editor' } });
    const joaoPf = await prisma.entity.create({
      data: { workspaceId: ana.workspaceId, kind: 'pf', name: 'Pessoal do João', ownerUserId: joao.userId },
    });
    const casa = await prisma.entity.create({
      data: { workspaceId: ana.workspaceId, kind: 'casa', name: 'Casa', visibility: 'compartilhada' },
    });

    const joaoScope = await resolveScopeForUser(joao.userId, ana.workspaceId);
    expect(joaoScope.role).toBe('editor');
    expect(joaoScope.defaultEntityIds).toEqual({ pf: joaoPf.id });
    expect([...joaoScope.visibleEntityIds].sort()).toEqual([joaoPf.id, casa.id].sort());
    expect(joaoScope.ownEntityIds).toEqual([joaoPf.id]);

    const anaScope = await resolveScopeForUser(ana.userId, ana.workspaceId);
    expect(anaScope.role).toBe('owner');
    expect(anaScope.defaultEntityIds).toEqual({ pf: anaPf.id, pj: anaPj.id });
    expect(anaScope.visibleEntityIds).not.toContain(joaoPf.id);
    expect([...anaScope.visibleEntityIds].sort()).toEqual([anaPf.id, anaPj.id, casa.id].sort());
  });

  it('pedir um workspace de que não participa é 404 e não cria workspace novo', async () => {
    const pessoa = await signUp('pessoa_fisica');
    const alheio = await signUp('pessoa_fisica');
    const before = await prisma.workspace.count();

    await expect(resolveScopeForUser(pessoa.userId, alheio.workspaceId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(resolveScopeForUser(pessoa.userId, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await prisma.workspace.count()).toBe(before);

    // Pela API: o cabeçalho x-workspace-id de outro workspace também não cria nada
    const login = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: (await prisma.user.findUniqueOrThrow({ where: { id: pessoa.userId } })).email, password: 'Password123!' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/workspace',
      headers: { authorization: `Bearer ${login.json().token}`, 'x-workspace-id': alheio.workspaceId },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.workspace.count()).toBe(before);
  });

  it('workspace arquivado é ignorado, inclusive quando o token antigo ainda aponta para ele', async () => {
    const pessoa = await signUp('pessoa_fisica');
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: pessoa.userId } })).email;
    // Login antes de entrar na família: o token carrega wid = workspace antigo
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const oldToken = login.json().token as string;

    const familia = await prisma.workspace.create({ data: { name: 'Família', profile: 'familia', onboardingCompletedAt: new Date() } });
    const pfNaFamilia = await prisma.entity.create({
      data: { workspaceId: familia.id, kind: 'pf', name: 'Pessoal', ownerUserId: pessoa.userId },
    });
    await prisma.workspaceMember.create({ data: { workspaceId: familia.id, userId: pessoa.userId, role: 'editor' } });
    await prisma.workspace.update({ where: { id: pessoa.workspaceId }, data: { archivedAt: new Date() } });

    const scope = await resolveScopeForUser(pessoa.userId);
    expect(scope.workspaceId).toBe(familia.id);
    expect(scope.defaultEntityIds.pf).toBe(pfNaFamilia.id);

    const res = await app.inject({ method: 'GET', url: '/api/workspace', headers: { authorization: `Bearer ${oldToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.id).toBe(familia.id);
  });

  it('PF criada pela guarda de entidade ausente já nasce com dono', async () => {
    const pessoa = await signUp('pessoa_fisica');
    await prisma.entity.updateMany({ where: { workspaceId: pessoa.workspaceId }, data: { active: false } });

    const scope = await resolveScopeForUser(pessoa.userId);

    const created = await prisma.entity.findUniqueOrThrow({ where: { id: scope.defaultEntityIds.pf } });
    expect(created.ownerUserId).toBe(pessoa.userId);
    expect(scope.ownEntityIds).toContain(created.id);
  });
});
