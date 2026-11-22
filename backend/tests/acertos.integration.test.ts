import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';

// Tarefa 18: de quem é o gasto × quem pagou. Quando diferem, nasce um acerto entre as entidades.

interface Session {
  token: string;
  workspaceId: string;
  pf: string;
  pj: string;
  expenseCategoryId: string;
  revenueCategoryId: string;
}

interface SettlementDto {
  id: string;
  transactionId: string;
  debtorEntityId: string;
  creditorEntityId: string;
  amount: string;
  status: string;
}

describe('Acertos entre entidades', () => {
  let app: FastifyInstance;
  const runId = Date.now();
  let seq = 0;
  let ana: Session;
  let outro: Session;

  async function signUp(): Promise<Session> {
    seq += 1;
    const email = `acertos_${seq}_${runId}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: `Pessoa ${seq}`, email, password: 'Password123!', accountType: 'mei' },
    });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const token = login.json().token as string;
    const ws = await app.inject({ method: 'GET', url: '/api/workspace', headers: { authorization: `Bearer ${token}` } });
    const entities = ws.json().entities as Array<{ id: string; kind: string }>;
    const workspaceId = ws.json().workspace.id as string;
    const expense = await prisma.category.findFirstOrThrow({ where: { workspaceId, type: 'despesa' } });
    const revenue = await prisma.category.findFirstOrThrow({ where: { workspaceId, type: 'receita' } });
    return {
      token,
      workspaceId,
      pf: entities.find((e) => e.kind === 'pf')!.id,
      pj: entities.find((e) => e.kind === 'pj')!.id,
      expenseCategoryId: expense.id,
      revenueCategoryId: revenue.id,
    };
  }

  function call(s: Session, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
    return app.inject({ method, url, headers: { authorization: `Bearer ${s.token}` }, payload: payload as never });
  }

  function createTx(s: Session, extra: Record<string, unknown>) {
    return call(s, 'POST', '/api/transactions', {
      description: 'Material de escritório',
      amount: '150.00',
      type: 'despesa',
      categoryId: s.expenseCategoryId,
      transactionDate: '2026-11-10',
      paymentMethod: 'cartao_credito',
      entityId: s.pj,
      ...extra,
    });
  }

  async function settlementOf(transactionId: string) {
    return prisma.settlement.findUnique({ where: { transactionId } });
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    ana = await signUp();
    outro = await signUp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('despesa da empresa paga pela PF gera acerto e aparece nos abertos com o saldo do par', async () => {
    const res = await createTx(ana, { paidByEntityId: ana.pf });
    expect(res.statusCode).toBe(201);
    expect(res.json().paidByEntityId).toBe(ana.pf);

    const list = await call(ana, 'GET', '/api/settlements?status=aberto');
    expect(list.statusCode).toBe(200);
    const items = list.json().items as SettlementDto[];
    const mine = items.find((i) => i.transactionId === res.json().id)!;
    expect(mine).toMatchObject({ debtorEntityId: ana.pj, creditorEntityId: ana.pf, amount: '150.00', status: 'aberto' });
    const balance = (list.json().balances as Array<{ debtorEntityId: string; creditorEntityId: string; total: string }>).find(
      (b) => b.debtorEntityId === ana.pj && b.creditorEntityId === ana.pf
    );
    expect(balance).toBeDefined();
  });

  it('receita da empresa que caiu na conta da PF: a PF deve à empresa', async () => {
    const res = await createTx(ana, { type: 'receita', categoryId: ana.revenueCategoryId, paidByEntityId: ana.pf });
    expect(res.statusCode).toBe(201);

    expect(await settlementOf(res.json().id)).toMatchObject({ debtorEntityId: ana.pf, creditorEntityId: ana.pj, status: 'aberto' });
  });

  it('pagador de outro workspace é 404 e nada é gravado', async () => {
    const before = await prisma.transaction.count({ where: { workspaceId: ana.workspaceId } });

    const res = await createTx(ana, { paidByEntityId: outro.pf });

    expect(res.statusCode).toBe(404);
    expect(await prisma.transaction.count({ where: { workspaceId: ana.workspaceId } })).toBe(before);
  });

  it('editar valor atualiza o acerto; pagador igual ao dono remove o acerto', async () => {
    const created = await createTx(ana, { paidByEntityId: ana.pf });
    const id = created.json().id as string;

    expect((await call(ana, 'PUT', `/api/transactions/${id}`, { amount: '200.00' })).statusCode).toBe(200);
    expect((await settlementOf(id))!.amount.toString()).toBe('200');

    expect((await call(ana, 'PUT', `/api/transactions/${id}`, { paidByEntityId: ana.pj })).statusCode).toBe(200);
    expect(await settlementOf(id)).toBeNull();
  });

  it('apagar lançamento com acerto aberto remove o acerto', async () => {
    const created = await createTx(ana, { paidByEntityId: ana.pf });
    const id = created.json().id as string;

    expect((await call(ana, 'DELETE', `/api/transactions/${id}`)).statusCode).toBeLessThan(300);
    expect(await settlementOf(id)).toBeNull();
  });

  it('marcar como acertado, desfazer, e apagar lançamento já acertado mantém o histórico como cancelado', async () => {
    const created = await createTx(ana, { paidByEntityId: ana.pf });
    const id = created.json().id as string;
    const settlement = (await settlementOf(id))!;

    const settle = await call(ana, 'POST', `/api/settlements/${settlement.id}/settle`, { via: 'transferencia' });
    expect(settle.statusCode).toBe(200);
    expect(settle.json()).toMatchObject({ status: 'acertado', settledVia: 'transferencia' });
    const open = (await call(ana, 'GET', '/api/settlements?status=aberto')).json().items as SettlementDto[];
    expect(open.some((i) => i.id === settlement.id)).toBe(false);

    expect((await call(ana, 'POST', `/api/settlements/${settlement.id}/reopen`)).json().status).toBe('aberto');
    await call(ana, 'POST', `/api/settlements/${settlement.id}/settle`, { via: 'abatimento' });

    await call(ana, 'DELETE', `/api/transactions/${id}`);
    expect((await settlementOf(id))!.status).toBe('cancelado');
  });

  it('via inválida é 400; acerto de outro workspace é 404', async () => {
    const created = await createTx(ana, { paidByEntityId: ana.pf });
    const settlement = (await settlementOf(created.json().id))!;

    expect((await call(ana, 'POST', `/api/settlements/${settlement.id}/settle`, { via: 'pix' })).statusCode).toBe(400);
    expect((await call(outro, 'POST', `/api/settlements/${settlement.id}/settle`, { via: 'abatimento' })).statusCode).toBe(404);
    const othersList = (await call(outro, 'GET', '/api/settlements')).json().items as SettlementDto[];
    expect(othersList.some((i) => i.id === settlement.id)).toBe(false);
  });

  it('viaPersonalAccount antigo em despesa da PJ vira acerto PJ → PF', async () => {
    const res = await createTx(ana, { viaPersonalAccount: true });

    expect(res.statusCode).toBe(201);
    expect(await settlementOf(res.json().id)).toMatchObject({ debtorEntityId: ana.pj, creditorEntityId: ana.pf });
  });

  it('aprovar compra do cartão da PF como gasto da empresa gera o acerto', async () => {
    const conn = await prisma.bankConnection.create({
      data: { workspaceId: ana.workspaceId, provider: 'pluggy', itemId: `acerto_${runId}`, institution: 'Banco', status: 'ativa' },
    });
    const account = await prisma.bankAccount.create({
      data: { connectionId: conn.id, externalId: `acc_acerto_${runId}`, kind: 'cartao_credito', name: 'Cartão PF', entityId: ana.pf },
    });
    const bankTx = await prisma.bankTransaction.create({
      data: {
        connectionId: conn.id,
        bankAccountId: account.id,
        provider: 'pluggy',
        externalId: `tx_acerto_${runId}`,
        direction: 'out',
        amount: '80.00',
        occurredOn: new Date('2026-11-12'),
        description: 'LOJA DE MATERIAIS',
        status: 'nova',
      },
    });

    // A Caixa de Revisão informa de qual entidade é a conta de origem, para a tela sugerir e comparar
    const inbox = await call(ana, 'GET', '/api/imports?status=nova');
    const listed = (inbox.json().items as Array<{ id: string; accountEntityId: string | null }>).find((i) => i.id === bankTx.id);
    expect(listed?.accountEntityId).toBe(ana.pf);

    const approve = await call(ana, 'POST', '/api/imports/approve', { bankTransactionId: bankTx.id, entityId: ana.pj });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ entityId: ana.pj, paidByEntityId: ana.pf });
    expect(await settlementOf(approve.json().id)).toMatchObject({ debtorEntityId: ana.pj, creditorEntityId: ana.pf });
  });
});
