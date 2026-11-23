import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Dashboard por entidade: saldo em caixa, série e últimas movimentações (integração)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const hoje = new Date();
  const dia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 2));
  const diaIso = dia.toISOString().slice(0, 10);
  const mesAtual = diaIso.slice(0, 7);

  async function setup() {
    const email = `dash_ent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Dash Entidade', email, password: 'Password123!', accountType: 'mei' },
    });
    expect(reg.statusCode).toBe(201);
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const auth = { authorization: `Bearer ${login.json().token as string}` };
    const workspaceId = reg.json().user.workspaceId as string;
    const pf = await prisma.entity.findFirstOrThrow({ where: { workspaceId, kind: 'pf' } });
    const pj = await prisma.entity.findFirstOrThrow({ where: { workspaceId, kind: 'pj' } });
    const tx = (entityId: string, type: 'receita' | 'despesa', amount: string, extra: Record<string, unknown> = {}) =>
      prisma.transaction.create({
        data: {
          workspaceId,
          entityId,
          type,
          direction: type === 'receita' ? 'in' : 'out',
          amount,
          description: `lanc-${type}-${amount}`,
          transactionDate: dia,
          status: 'confirmado',
          ...extra,
        },
      });
    const dash = async (entityId?: string) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard${entityId ? `?entityId=${entityId}` : ''}`,
        headers: auth,
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };
    return { auth, workspaceId, pf, pj, tx, dash };
  }

  const mesDaSerie = (d: { evolucaoMensal: { mes: string }[] }) => d.evolucaoMensal.find((m) => m.mes === mesAtual)!;

  it('saldo, série e últimos lançamentos respeitam o entityId (PJ, PF e workspace)', async () => {
    const { pf, pj, tx, dash } = await setup();
    await tx(pj.id, 'receita', '1000.00');
    await tx(pj.id, 'despesa', '300.00');
    await tx(pf.id, 'receita', '200.00');
    await tx(pf.id, 'despesa', '50.00');

    const dPj = await dash(pj.id);
    expect(dPj.saldoAtual).toBe(700);
    expect(mesDaSerie(dPj)).toMatchObject({ receitas: 1000, despesas: 300, resultado: 700 });
    expect(dPj.ultimasTransacoes).toHaveLength(2);
    expect(dPj.ultimasTransacoes.every((t: { entityId: string }) => t.entityId === pj.id)).toBe(true);

    const dPf = await dash(pf.id);
    expect(dPf.saldoAtual).toBe(150);
    expect(mesDaSerie(dPf)).toMatchObject({ receitas: 200, despesas: 50, resultado: 150 });
    expect(dPf.ultimasTransacoes.every((t: { entityId: string }) => t.entityId === pf.id)).toBe(true);

    const dAll = await dash();
    expect(dAll.saldoAtual).toBe(850);
    expect(mesDaSerie(dAll)).toMatchObject({ receitas: 1200, despesas: 350, resultado: 850 });
    expect(dAll.ultimasTransacoes).toHaveLength(4);
  });

  it('pró-labore move o caixa entre entidades, não muda o saldo do workspace nem o resultado', async () => {
    const { auth, pf, pj, tx, dash } = await setup();
    await tx(pj.id, 'receita', '1000.00');
    const antesAll = await dash();

    const res = await app.inject({
      method: 'POST',
      url: '/api/owner-withdrawals',
      headers: auth,
      payload: { amount: '400.00', occurredOn: diaIso },
    });
    expect(res.statusCode).toBeLessThan(300);

    const dPj = await dash(pj.id);
    const dPf = await dash(pf.id);
    expect(dPj.saldoAtual).toBe(600);
    expect(dPf.saldoAtual).toBe(400);
    expect(dPj.periodo.totalDespesas).toBe(0);
    expect(dPf.periodo.totalEntradas).toBe(0);
    expect(mesDaSerie(dPj)).toMatchObject({ receitas: 1000, despesas: 0 });
    expect(mesDaSerie(dPf)).toMatchObject({ receitas: 0, despesas: 0 });
    // as pernas aparecem nas últimas movimentações de cada entidade
    expect(dPf.ultimasTransacoes).toHaveLength(1);

    const depoisAll = await dash();
    expect(depoisAll.saldoAtual).toBe(antesAll.saldoAtual);
    expect(depoisAll.saldoAtual).toBe(1000);
  });

  it('entrada "não é renda" entra no saldo da entidade mas não no resultado nem na série', async () => {
    const { pj, tx, dash } = await setup();
    await tx(pj.id, 'receita', '100.00');
    await tx(pj.id, 'receita', '250.00', { transferType: 'own_account', transferGroupId: crypto.randomUUID() });

    const d = await dash(pj.id);
    expect(d.saldoAtual).toBe(350);
    expect(d.periodo.totalEntradas).toBe(100);
    expect(mesDaSerie(d)).toMatchObject({ receitas: 100, resultado: 100 });
    expect((await dash()).saldoAtual).toBe(350);
  });

  it('ignora pendentes de revisão e apagados no saldo, e entidade de outro workspace dá 404', async () => {
    const { pj, tx, dash, auth } = await setup();
    await tx(pj.id, 'receita', '100.00');
    await tx(pj.id, 'receita', '999.00', { status: 'pendente_revisao' });
    await tx(pj.id, 'receita', '888.00', { deletedAt: new Date() });
    expect((await dash(pj.id)).saldoAtual).toBe(100);

    const outro = await setup();
    const res = await app.inject({ method: 'GET', url: `/api/dashboard?entityId=${outro.pj.id}`, headers: auth });
    expect(res.statusCode).toBe(404);
  });
});
