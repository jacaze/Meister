import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Família, fase 1 (docs/familia.md §10): só schema. Visibilidade por entidade e por conta, entidade "casa",
// convites, workspace arquivado e nota fiscal com entidade/pessoa. Nada muda para quem usa sozinho.

describe('Família — schema (fase 1)', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  let workspaceId = '';
  let userId = '';
  let pfId = '';

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const email = `familia_schema_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Fulana Família', email, password: 'Password123!', accountType: 'mei' },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = user.id;
    const member = await prisma.workspaceMember.findFirstOrThrow({ where: { userId } });
    workspaceId = member.workspaceId;
    pfId = (await prisma.entity.findFirstOrThrow({ where: { workspaceId, kind: 'pf' } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('entidades criadas pelo cadastro nascem pessoais; workspace não arquivado', async () => {
    const entities = await prisma.entity.findMany({ where: { workspaceId } });
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.every((e) => e.visibility === 'pessoal')).toBe(true);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).archivedAt).toBeNull();
  });

  it('aceita a entidade "casa" compartilhada e recusa visibilidade desconhecida', async () => {
    const casa = await prisma.entity.create({
      data: { workspaceId, kind: 'casa', name: 'Casa', visibility: 'compartilhada' },
    });
    expect(casa.ownerUserId).toBeNull();

    await expect(
      prisma.entity.create({ data: { workspaceId, kind: 'pf', name: 'X', visibility: 'publica' } })
    ).rejects.toThrow();
  });

  it('contas nascem pessoais e recusam visibilidade desconhecida', async () => {
    const fin = await prisma.financialAccount.create({
      data: { workspaceId, entityId: pfId, kind: 'banco', name: 'Conta' },
    });
    expect(fin.visibility).toBe('pessoal');
    const conn = await prisma.bankConnection.create({
      data: { workspaceId, provider: 'pluggy', itemId: `familia_${runId}`, institution: 'Banco', status: 'ativa' },
    });
    const bank = await prisma.bankAccount.create({ data: { connectionId: conn.id, name: 'Cartão' } });
    expect(bank.visibility).toBe('pessoal');

    await expect(
      prisma.bankAccount.update({ where: { id: bank.id }, data: { visibility: 'todos' } })
    ).rejects.toThrow();
    await expect(
      prisma.financialAccount.update({ where: { id: fin.id }, data: { visibility: 'todos' } })
    ).rejects.toThrow();
  });

  it('convite: token único, status e papel válidos, apagado junto com o workspace', async () => {
    const tokenHash = `hash_${randomUUID()}`;
    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: 'conjuge@test.com',
        role: 'editor',
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        invitedByUserId: userId,
      },
    });
    expect(invite.status).toBe('pendente');

    await expect(
      prisma.workspaceInvite.create({
        data: { workspaceId, email: 'outro@test.com', role: 'viewer', tokenHash, expiresAt: new Date() },
      })
    ).rejects.toThrow();
    await expect(
      prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'aprovado' } })
    ).rejects.toThrow();
    await expect(
      prisma.workspaceInvite.update({ where: { id: invite.id }, data: { role: 'admin' } })
    ).rejects.toThrow();

    const temp = await prisma.workspace.create({ data: { name: 'Temporário' } });
    await prisma.workspaceInvite.create({
      data: { workspaceId: temp.id, email: 'x@test.com', role: 'viewer', tokenHash: `hash_${randomUUID()}`, expiresAt: new Date() },
    });
    await prisma.workspace.delete({ where: { id: temp.id } });
    expect(await prisma.workspaceInvite.count({ where: { workspaceId: temp.id } })).toBe(0);
  });

  it('nota fiscal guarda entidade e pessoa; apagar a entidade só desfaz o vínculo', async () => {
    const entity = await prisma.entity.create({ data: { workspaceId, kind: 'autonomo', name: 'Temporária' } });
    const receipt = await prisma.fiscalReceipt.create({
      data: {
        workspaceId,
        accessKey: String(runId).padStart(44, '0').slice(0, 44),
        entityId: entity.id,
        userId,
      },
    });

    await prisma.entity.delete({ where: { id: entity.id } });

    const after = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(after.entityId).toBeNull();
    expect(after.userId).toBe(userId);
  });
});
