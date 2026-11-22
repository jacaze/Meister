import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { resolveScopeForUser } from '../src/modules/workspace/public.js';
import { PrismaFinancialSnapshotReader } from '../src/modules/insights/infra/PrismaFinancialSnapshotReader.js';
import { buildMonthlyDigest, askFinances } from '../src/modules/insights/public.js';
import { evaluateNudges } from '../src/modules/education/public.js';

/**
 * Lançamentos apagados (soft delete) ou ainda não confirmados não podem entrar em nenhum total:
 * resumo do mês, insights, /perguntar e aviso de limite MEI.
 */
describe('Lançamentos apagados fora de insights, resumo, perguntar e nudge (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;
  let pjId: string;
  let pfId: string;
  let cats: Record<string, string> = {};
  let userId: string;
  let scope: Awaited<ReturnType<typeof resolveScopeForUser>>;

  const auth = () => ({ authorization: `Bearer ${token}` });
  const now = new Date();
  const dia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;

  async function criar(type: 'receita' | 'despesa', amount: string, description: string, entityId = pjId) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(),
      payload: { type, amount, description, transactionDate: dia, entityId, categoryId: cats[type] },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().id as string;
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const email = `apagados-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = 'Password123!';
    await app.inject({ method: 'POST', url: '/api/register', payload: { name: 'Apagados', email, password, accountType: 'mei' } });
    token = (await app.inject({ method: 'POST', url: '/api/login', payload: { email, password } })).json().token as string;
    const ws = (await app.inject({ method: 'GET', url: '/api/workspace', headers: auth() })).json();
    workspaceId = ws.workspace.id;
    pjId = (ws.entities as Array<{ id: string; kind: string }>).find((e) => e.kind === 'pj')!.id;
    pfId = (ws.entities as Array<{ id: string; kind: string }>).find((e) => e.kind === 'pf')!.id;
    const catList = (await app.inject({ method: 'GET', url: '/api/categories', headers: auth() })).json() as Array<{ id: string; type: string }>;
    cats = { receita: catList.find((c) => c.type === 'receita')!.id, despesa: catList.find((c) => c.type === 'despesa')!.id };
    userId = (await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId } })).userId;
    scope = await resolveScopeForUser(userId, workspaceId);
  });

  afterAll(async () => {
    await app.close();
  });

  it('não soma lançamentos apagados nem pendentes no resumo, snapshot, saldo, gastos e nudge', async () => {
    await criar('receita', '1000.00', 'Venda válida');
    await criar('despesa', '100.00', 'Despesa válida');
    const recApagada = await criar('receita', '70000.00', 'Venda apagada');
    const despApagada = await criar('despesa', '5000.00', 'Despesa apagada');
    const recPendente = await criar('receita', '9000.00', 'Venda não confirmada');
    await prisma.transaction.update({ where: { id: recPendente }, data: { status: 'pendente' } });

    for (const id of [recApagada, despApagada]) {
      const del = await app.inject({ method: 'DELETE', url: `/api/transactions/${id}`, headers: auth() });
      expect(del.statusCode).toBeLessThan(300);
    }

    // Resumo do mês (/resumo no Telegram)
    const digest = await buildMonthlyDigest(scope);
    expect(digest.totalIncome).toBe('R$ 1.000,00');
    expect(digest.totalExpense).toBe('R$ 100,00');

    // Snapshot dos insights
    const snap = await new PrismaFinancialSnapshotReader().readSnapshot(scope, pjId);
    expect(snap.currentMonth.totalIncomeCents).toBe(100000n);
    expect(snap.currentMonth.totalExpenseCents).toBe(10000n);

    // /perguntar: saldo e gastos por período
    const saldo = await askFinances(scope, 'Qual é o meu saldo em caixa?');
    expect(saldo.metrics?.totalEntradas).toBe('1000.00');
    expect(saldo.metrics?.totalSaidas).toBe('100.00');
    const gastos = await askFinances(scope, 'quanto gastei este mês?');
    expect(JSON.stringify(gastos)).not.toContain('5000');

    // Nudge de limite MEI: 1000 válidos não chegam a 80%; apagado/pendente (79000) não podem disparar
    const nudges = await evaluateNudges(scope);
    expect(nudges.find((n) => n.trigger === 'limit_band_atencao')).toBeUndefined();
  });

  it('AskFinances encontra DAS atrasado (status calculado pelo módulo fiscal)', async () => {
    await prisma.dasCharge.create({
      data: {
        workspaceId,
        entityId: pjId,
        competence: '2020-01',
        dueDate: new Date('2020-02-20'),
        amount: '75.90',
      },
    });
    await prisma.dasCharge.updateMany({
      where: { workspaceId, entityId: pjId, competence: { not: '2020-01' } },
      data: { status: 'pago', paidOn: new Date('2020-03-01') },
    });
    const r = await askFinances(scope, 'Tenho DAS para pagar?');
    expect(r.intent).toBe('das');
    expect(r.answer).toContain('01/2020');
    expect(r.answer).toContain('20/02/2020');
    expect(r.answer).toContain('ATRASADO');
  });

  describe('entityId opcional no digest e no /perguntar', () => {
    let tokenOutro: string;
    let pjOutro: string;

    beforeAll(async () => {
      await criar('receita', '200.00', 'Receita PF', pfId);
      await criar('despesa', '30.00', 'Despesa PF', pfId);
      const email = `apagados-outro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
      const password = 'Password123!';
      await app.inject({ method: 'POST', url: '/api/register', payload: { name: 'Outro', email, password, accountType: 'mei' } });
      tokenOutro = (await app.inject({ method: 'POST', url: '/api/login', payload: { email, password } })).json().token as string;
      const ws = (await app.inject({ method: 'GET', url: '/api/workspace', headers: { authorization: `Bearer ${tokenOutro}` } })).json();
      pjOutro = (ws.entities as Array<{ id: string; kind: string }>).find((e) => e.kind === 'pj')!.id;
    });

    const digest = async (qs: string) => app.inject({ method: 'GET', url: `/api/insights/digest${qs}`, headers: auth() });
    const ask = async (question: string, entityId?: string, t = token) =>
      app.inject({ method: 'POST', url: '/api/insights/ask', headers: { authorization: `Bearer ${t}` }, payload: { question, entityId } });

    it('digest filtra pela entidade pedida e soma tudo sem entityId', async () => {
      const pf = (await digest(`?entityId=${pfId}`)).json();
      expect(pf.totalIncome).toBe('R$ 200,00');
      expect(pf.totalExpense).toBe('R$ 30,00');
      const pj = (await digest(`?entityId=${pjId}`)).json();
      expect(pj.totalIncome).toBe('R$ 1.000,00');
      expect(pj.totalExpense).toBe('R$ 100,00');
      const todos = (await digest('')).json();
      expect(todos.totalIncome).toBe('R$ 1.200,00');
      expect(todos.totalExpense).toBe('R$ 130,00');
    });

    it('digest de entidade de outro workspace devolve 404 e id inválido 400', async () => {
      expect((await digest(`?entityId=${pjOutro}`)).statusCode).toBe(404);
      expect((await digest('?entityId=nao-e-uuid')).statusCode).toBe(400);
    });

    it('/perguntar respeita entityId no saldo e devolve 404 para entidade alheia', async () => {
      const pf = (await ask('Qual é o meu saldo em caixa?', pfId)).json();
      expect(pf.metrics.totalEntradas).toBe('200.00');
      expect(pf.metrics.totalSaidas).toBe('30.00');
      const todos = (await ask('Qual é o meu saldo em caixa?')).json();
      expect(todos.metrics.totalEntradas).toBe('1200.00');
      expect((await ask('Qual é o meu saldo em caixa?', pjOutro)).statusCode).toBe(404);
    });
  });
});
