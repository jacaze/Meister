import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { resolveScopeForUser } from '../src/modules/workspace/public.js';
import { resetInsightsRefreshCache, runDetectors } from '../src/modules/insights/public.js';

/**
 * Insights por entidade (PF x PJ): o run respeita o entityId, cada insight só usa os dados da
 * sua entidade, a página não fica vazia e os textos saem em pt-BR.
 */
describe('Insights por entidade e formatação (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let workspaceId: string;
  let pfId: string;
  let pjId: string;
  let cats: Record<string, string> = {};
  const auth = () => ({ authorization: `Bearer ${token}` });
  const now = new Date();
  const mes = (offset: number, dia = 10) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, dia, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  async function criar(type: 'receita' | 'despesa', amount: string, entityId: string, transactionDate: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(),
      payload: { type, amount, description: `${type} ${amount}`, transactionDate, entityId, categoryId: cats[type] },
    });
    expect(res.statusCode, res.body).toBe(201);
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const email = `ins-qual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = 'Password123!';
    await app.inject({ method: 'POST', url: '/api/register', payload: { name: 'Qualidade', email, password, accountType: 'mei' } });
    token = (await app.inject({ method: 'POST', url: '/api/login', payload: { email, password } })).json().token as string;
    const ws = (await app.inject({ method: 'GET', url: '/api/workspace', headers: auth() })).json();
    workspaceId = ws.workspace.id;
    const entities = ws.entities as Array<{ id: string; kind: string }>;
    pjId = entities.find((e) => e.kind === 'pj')!.id;
    pfId = entities.find((e) => e.kind === 'pf')!.id;
    const catList = (await app.inject({ method: 'GET', url: '/api/categories', headers: auth() })).json() as Array<{ id: string; type: string }>;
    cats = { receita: catList.find((c) => c.type === 'receita')!.id, despesa: catList.find((c) => c.type === 'despesa')!.id };

    // PF: mês atual +893,86 e meses anteriores positivos; PJ: prejuízo no mês atual
    await criar('receita', '3500.00', pfId, mes(0, 1));
    await criar('despesa', '2606.14', pfId, mes(0, 2));
    await criar('receita', '3000.00', pfId, mes(-1));
    await criar('despesa', '1000.00', pfId, mes(-1));
    await criar('receita', '1000.00', pjId, mes(0, 1));
    await criar('despesa', '4000.00', pjId, mes(0, 2));
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /insights/run com entityId PF grava insights da PF e GET ?entityId=PF os lista', async () => {
    const run = await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: pfId } });
    expect(run.statusCode).toBe(200);
    const items = run.json().items as Array<{ entityId: string; detectorId: string; narrationText: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.entityId === pfId)).toBe(true);

    const list = await app.inject({ method: 'GET', url: `/api/insights?entityId=${pfId}`, headers: auth() });
    expect(list.statusCode).toBe(200);
    const listed = list.json().items as Array<{ entityId: string; detectorId: string; narrationText: string }>;
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((i) => i.entityId === pfId)).toBe(true);
    const trend = listed.find((i) => i.detectorId === 'positive_trend');
    expect(trend?.narrationText).toContain('R$ 893,86');
  });

  it('rodar a PJ depois não sobrescreve nem rouba os insights da PF (sem mistura de valores)', async () => {
    await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: pjId } });
    const pf = (await app.inject({ method: 'GET', url: `/api/insights?entityId=${pfId}`, headers: auth() })).json().items as Array<{ entityId: string; detectorId: string; narrationText: string }>;
    const pj = (await app.inject({ method: 'GET', url: `/api/insights?entityId=${pjId}`, headers: auth() })).json().items as Array<{ entityId: string; detectorId: string; narrationText: string }>;
    expect(pf.find((i) => i.detectorId === 'positive_trend')?.narrationText).toContain('R$ 893,86');
    expect(pj.every((i) => i.entityId === pjId)).toBe(true);
    expect(pj.find((i) => i.detectorId === 'positive_trend')).toBeUndefined();
    for (const i of pj) expect(i.narrationText).not.toContain('893,86');
  });

  it('entidade de outro workspace responde 404 no run e na listagem', async () => {
    const outroEmail = `ins-outro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    await app.inject({ method: 'POST', url: '/api/register', payload: { name: 'Outro', email: outroEmail, password: 'Password123!', accountType: 'mei' } });
    const outroToken = (await app.inject({ method: 'POST', url: '/api/login', payload: { email: outroEmail, password: 'Password123!' } })).json().token as string;
    const outroWs = (await app.inject({ method: 'GET', url: '/api/workspace', headers: { authorization: `Bearer ${outroToken}` } })).json();
    const entidadeAlheia = (outroWs.entities as Array<{ id: string }>)[0]!.id;

    const run = await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: entidadeAlheia } });
    expect(run.statusCode).toBe(404);
    const list = await app.inject({ method: 'GET', url: `/api/insights?entityId=${entidadeAlheia}`, headers: auth() });
    expect(list.statusCode).toBe(404);
    const digest = await app.inject({ method: 'GET', url: `/api/insights/digest?entityId=${entidadeAlheia}`, headers: auth() });
    expect(digest.statusCode).toBe(404);
  });

  it('GET /insights gera automaticamente para todas as entidades quando ainda não há insights', async () => {
    await prisma.insight.deleteMany({ where: { workspaceId } });
    resetInsightsRefreshCache();
    const res = await app.inject({ method: 'GET', url: '/api/insights', headers: auth() });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ entityId: string }>;
    expect(new Set(items.map((i) => i.entityId))).toContain(pfId);
  });

  it('reexecutar não duplica insights (dedupe por workspace + entidade + detector)', async () => {
    const antes = await prisma.insight.count({ where: { workspaceId } });
    await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: pfId } });
    await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: pfId } });
    expect(await prisma.insight.count({ where: { workspaceId } })).toBe(antes);
  });

  it('roda como ator de sistema (tick) sem violar FK de usuário', async () => {
    const userId = (await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId } })).userId;
    const base = await resolveScopeForUser(userId, workspaceId);
    await prisma.insight.deleteMany({ where: { workspaceId } });
    const items = await runDetectors({ ...base, actorUserId: 'system:internal-tick' as never }, { entityId: pfId });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.userId === null)).toBe(true);
  });

  it('digest: valores em pt-BR e até 3 pontos, com resumo receitas/despesas/resultado', async () => {
    await prisma.insight.deleteMany({ where: { workspaceId } });
    const res = await app.inject({ method: 'GET', url: `/api/insights/digest?entityId=${pfId}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.totalIncome).toBe('R$ 3.500,00');
    expect(d.totalExpense).toBe('R$ 2.606,14');
    expect(d.netResult).toBe('+R$ 893,86');
    expect(d.points.length).toBeGreaterThanOrEqual(1);
    expect(d.points.length).toBeLessThanOrEqual(3);
    expect(d.points[0]).toContain('receitas de R$ 3.500,00, despesas de R$ 2.606,14 e resultado de R$ 893,86');
    expect(JSON.stringify(d)).not.toContain('movimentação total');
  });

  it('ask: saldo e limite com milhar/vírgula e período gramatical', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/insights/ask', headers: auth(), payload: { question: 'Quanto gastei?', entityId: pfId } });
    expect(res.statusCode).toBe(200);
    const answer = res.json().answer as string;
    expect(answer).toContain('R$ 2.606,14');
    expect(answer).toMatch(/^Neste mês,/);
    expect(answer).not.toContain('Em Este mês');
  });

  it('dois workspaces rodando o mesmo detector no mesmo período não se sobrescrevem e não enxergam insights um do outro', async () => {
    const email2 = `ins-ws2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    await app.inject({ method: 'POST', url: '/api/register', payload: { name: 'Outro WS', email: email2, password: 'Password123!', accountType: 'mei' } });
    const token2 = (await app.inject({ method: 'POST', url: '/api/login', payload: { email: email2, password: 'Password123!' } })).json().token as string;
    const auth2 = { authorization: `Bearer ${token2}` };
    const ws2 = (await app.inject({ method: 'GET', url: '/api/workspace', headers: auth2 })).json();
    const pf2 = (ws2.entities as Array<{ id: string; kind: string }>).find((e) => e.kind === 'pf')!.id;
    const cats2 = (await app.inject({ method: 'GET', url: '/api/categories', headers: auth2 })).json() as Array<{ id: string; type: string }>;
    const post = (type: 'receita' | 'despesa', amount: string, date: string) =>
      app.inject({
        method: 'POST',
        url: '/api/transactions',
        headers: auth2,
        payload: { type, amount, description: `${type} ws2`, transactionDate: date, entityId: pf2, categoryId: cats2.find((c) => c.type === type)!.id },
      });
    expect((await post('receita', '9000.00', mes(0, 1))).statusCode).toBe(201);
    expect((await post('despesa', '1000.00', mes(0, 2))).statusCode).toBe(201);
    expect((await post('receita', '5000.00', mes(-1))).statusCode).toBe(201);

    await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: pfId } });
    await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth2, payload: { entityId: pf2 } });
    await app.inject({ method: 'POST', url: '/api/insights/run', headers: auth(), payload: { entityId: pfId } });

    const meus = (await app.inject({ method: 'GET', url: `/api/insights?entityId=${pfId}`, headers: auth() })).json().items as Array<{ id: string; detectorId: string; narrationText: string }>;
    const deles = (await app.inject({ method: 'GET', url: `/api/insights?entityId=${pf2}`, headers: auth2 })).json().items as Array<{ id: string; detectorId: string; narrationText: string }>;
    expect(meus.find((i) => i.detectorId === 'positive_trend')?.narrationText).toContain('R$ 893,86');
    expect(deles.find((i) => i.detectorId === 'positive_trend')?.narrationText).toContain('R$ 8.000,00');
    const ids2 = new Set(deles.map((i) => i.id));
    expect(meus.some((i) => ids2.has(i.id))).toBe(false);

    // anti-IDOR: insight alheio => 404 em explicar, dispensar e feedback
    const alheio = deles[0]!.id;
    expect((await app.inject({ method: 'GET', url: `/api/insights/${alheio}`, headers: auth() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/insights/${alheio}/dismiss`, headers: auth() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/insights/${alheio}/feedback`, headers: auth(), payload: { value: 'util' } })).statusCode).toBe(404);
  });
});
