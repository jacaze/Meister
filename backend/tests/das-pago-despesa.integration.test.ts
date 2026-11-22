import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('DAS pago cria a despesa no ledger (integração)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup(prefix: string) {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Teste DAS', email, password: 'Password123!', accountType: 'mei' },
    });
    expect(reg.statusCode).toBe(201);
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const token = login.json().token as string;
    const workspaceId = reg.json().user.workspaceId as string;
    const pj = await prisma.entity.findFirstOrThrow({ where: { workspaceId, kind: 'pj' } });
    const charge = await prisma.dasCharge.create({
      data: { workspaceId, entityId: pj.id, competence: '2026-10', dueDate: new Date('2026-11-20'), amount: 81.9 },
    });
    return { token, workspaceId, pj, charge, auth: { authorization: `Bearer ${token}` } };
  }

  const dasTx = (workspaceId: string, chargeId: string) =>
    prisma.transaction.findMany({
      where: { workspaceId, sourceRef: `das:${chargeId}`, deletedAt: null },
      include: { category: true },
    });

  it('marcar como pago cria UMA despesa DAS na entidade MEI com valor pago e data do pagamento', async () => {
    const { workspaceId, pj, charge, auth } = await setup('das_pay');
    const res = await app.inject({
      method: 'POST',
      url: `/api/das/${charge.id}/pay`,
      headers: auth,
      payload: { paidOn: '2026-11-10', paidAmount: '85.50' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('pago');

    const txs = await dasTx(workspaceId, charge.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.type).toBe('despesa');
    expect(txs[0]!.entityId).toBe(pj.id);
    expect(txs[0]!.category?.slug).toBe('impostos-das');
    expect(txs[0]!.amount.toString()).toBe('85.5');
    expect(txs[0]!.transactionDate.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(txs[0]!.description).toBe('DAS 10/2026');
  });

  it('sem valor informado usa o valor da guia; repetir não duplica', async () => {
    const { workspaceId, charge, auth } = await setup('das_idem');
    const pay = () =>
      app.inject({ method: 'POST', url: `/api/das/${charge.id}/pay`, headers: auth, payload: { paidOn: '2026-11-10' } });
    expect((await pay()).statusCode).toBe(200);
    expect((await pay()).statusCode).toBe(200);
    const txs = await dasTx(workspaceId, charge.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount.toString()).toBe('81.9');
  });

  it('desfazer remove a despesa; pagar de novo recria sem duplicar', async () => {
    const { workspaceId, charge, auth } = await setup('das_undo');
    const url = `/api/das/${charge.id}/pay`;
    await app.inject({ method: 'POST', url, headers: auth, payload: { paidOn: '2026-11-10' } });
    const del = await app.inject({ method: 'DELETE', url, headers: auth });
    expect(del.statusCode).toBe(200);
    expect(del.json().status).toBe('pendente');
    expect(await dasTx(workspaceId, charge.id)).toHaveLength(0);

    await app.inject({ method: 'POST', url, headers: auth, payload: { paidOn: '2026-11-11' } });
    expect(await dasTx(workspaceId, charge.id)).toHaveLength(1);
  });

  it('desfazer não falha se a despesa já foi apagada manualmente', async () => {
    const { workspaceId, charge, auth } = await setup('das_manual');
    const url = `/api/das/${charge.id}/pay`;
    await app.inject({ method: 'POST', url, headers: auth, payload: { paidOn: '2026-11-10' } });
    const [tx] = await dasTx(workspaceId, charge.id);
    const manual = await app.inject({ method: 'DELETE', url: `/api/transactions/${tx!.id}`, headers: auth });
    expect(manual.statusCode).toBeLessThan(300);
    const del = await app.inject({ method: 'DELETE', url, headers: auth });
    expect(del.statusCode).toBe(200);
    expect(del.json().status).toBe('pendente');
  });

  it('outro workspace recebe 404 e nenhuma despesa é criada ou removida', async () => {
    const a = await setup('das_a');
    const b = await setup('das_b');
    const pay = await app.inject({
      method: 'POST', url: `/api/das/${a.charge.id}/pay`, headers: b.auth, payload: { paidOn: '2026-11-10' },
    });
    expect(pay.statusCode).toBe(404);
    expect(await dasTx(a.workspaceId, a.charge.id)).toHaveLength(0);

    await app.inject({ method: 'POST', url: `/api/das/${a.charge.id}/pay`, headers: a.auth, payload: { paidOn: '2026-11-10' } });
    const del = await app.inject({ method: 'DELETE', url: `/api/das/${a.charge.id}/pay`, headers: b.auth });
    expect(del.statusCode).toBe(404);
    expect(await dasTx(a.workspaceId, a.charge.id)).toHaveLength(1);
  });
});
