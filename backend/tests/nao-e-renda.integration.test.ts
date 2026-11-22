import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { resolveScopeForUser } from '../src/modules/workspace/public.js';
import { PrismaFinancialSnapshotReader } from '../src/modules/insights/infra/PrismaFinancialSnapshotReader.js';

/**
 * "Não é renda": entrada importada (ex.: PIX RECEBIDO vindo de outra conta própria ou reembolso)
 * fica registrada no ledger como perna única de transferência e não infla receita do mês,
 * insights, base dos potes nem o limite MEI. Reversível pelo ledger.
 */
describe('Entrada que não é renda (Integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let tokenOutro: string;
  let userId: string;
  let pjId: string;

  const auth = (t = token) => ({ authorization: `Bearer ${t}` });

  // Dia 10 do mês corrente: dentro do mês em qualquer fuso usado pelos relatórios
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dia = `${yyyy}-${mm}-10`;

  async function registrar(prefixo: string) {
    const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = 'Password123!';
    const reg = await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Não É Renda', email, password, accountType: 'mei' },
    });
    expect(reg.statusCode).toBe(201);
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password } });
    return login.json().token as string;
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    token = await registrar('nao-e-renda');
    tokenOutro = await registrar('nao-e-renda-outro');
    const ws = (await app.inject({ method: 'GET', url: '/api/workspace', headers: auth() })).json();
    pjId = (ws.entities as Array<{ id: string; kind: string }>).find((e) => e.kind === 'pj')!.id;
    userId = (await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: ws.workspace.id } })).userId;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Importa um extrato com uma entrada e uma saída; devolve os ids da fila. */
  async function importar(valorEntrada: string, valorSaida = '7.13') {
    const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const ymd = dia.replaceAll('-', '');
    const ofx = `OFXHEADER:100\n<OFX>
  <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>${ymd}120000</DTPOSTED><TRNAMT>${valorEntrada}</TRNAMT><FITID>NER-IN-${stamp}</FITID><MEMO>PIX RECEBIDO ${stamp}</MEMO></STMTTRN>
  <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>${ymd}120000</DTPOSTED><TRNAMT>-${valorSaida}</TRNAMT><FITID>NER-OUT-${stamp}</FITID><MEMO>PIX ENVIADO ${stamp}</MEMO></STMTTRN>
</OFX>`;
    const imp = await app.inject({
      method: 'POST',
      url: '/api/imports/statement',
      headers: auth(),
      payload: { content: ofx, provider: 'ofx', institution: 'Banco Teste' },
    });
    expect(imp.statusCode).toBe(201);
    const inbox = await app.inject({ method: 'GET', url: '/api/imports', headers: auth() });
    const itens = (inbox.json().items as Array<{ id: string; description: string; direction: string }>).filter((it) =>
      it.description.includes(stamp)
    );
    return {
      entrada: itens.find((it) => it.direction === 'in')!.id,
      saida: itens.find((it) => it.direction === 'out')!.id,
    };
  }

  /** Todas as leituras de "renda" que a entrada não pode inflar, em centavos. */
  async function medir() {
    const cents = (v: string | number) => Math.round(Number(v) * 100);
    const dashboard = (await app.inject({ method: 'GET', url: '/api/dashboard', headers: auth() })).json();
    const limite = (await app.inject({ method: 'GET', url: `/api/mei/limit?entityId=${pjId}`, headers: auth() })).json();
    const potes = (await app.inject({ method: 'GET', url: `/api/jars?entityId=${pjId}&month=${yyyy}-${mm}`, headers: auth() })).json();
    const lista = (
      await app.inject({ method: 'GET', url: `/api/transactions?startDate=${yyyy}-${mm}-01&endDate=${dia}`, headers: auth() })
    ).json();
    const digest = (await app.inject({ method: 'GET', url: `/api/insights/digest?month=${yyyy}-${mm}`, headers: auth() })).json();
    const scope = await resolveScopeForUser(userId);
    const snapshot = await new PrismaFinancialSnapshotReader().readSnapshot(scope, pjId, new Date(`${dia}T12:00:00`));
    return {
      dashboardMes: cents(dashboard.periodo.totalEntradas),
      limiteMei: cents(limite.faturamentoAno),
      basePotes: cents(potes.base),
      listaEntradas: cents(lista.resumo.totalEntradas),
      digestReceita: cents(String(digest.totalIncome).replace('R$ ', '').replace(',', '.')),
      insightsReceitaMes: Number(snapshot.currentMonth.totalIncomeCents),
    };
  }

  const somar = (m: Awaited<ReturnType<typeof medir>>, centavos: number) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v + centavos]));

  it('fila: "veio de outra conta minha" registra no ledger sem contar como renda; desfazer volta a contar', async () => {
    const { entrada } = await importar('250.00');
    const antes = await medir();

    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(),
      payload: { bankTransactionId: entrada, categoryId: null, nonIncomeReason: 'own_account' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transferType).toBe('own_account');

    const bank = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: entrada } });
    expect(bank.status).toBe('importada');
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: bank.importedTransactionId! } });
    expect(tx.type).toBe('receita');
    expect(tx.transferType).toBe('own_account');
    expect(tx.transferGroupId).not.toBeNull();
    expect(tx.origin).toBe('importacao');

    expect(await medir()).toEqual(antes);

    // Desfazer: volta a ser receita comum e passa a contar em todos os lugares
    const desfazer = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${tx.id}/non-income`,
      headers: auth(),
      payload: { reason: null },
    });
    expect(desfazer.statusCode).toBe(200);
    expect(desfazer.json().transferType).toBeNull();
    expect(desfazer.json().transferGroupId).toBeNull();
    expect(await medir()).toEqual(somar(antes, 25000));

    // Marca de novo, agora como reembolso: sai de novo de tudo
    const reembolso = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${tx.id}/non-income`,
      headers: auth(),
      payload: { reason: 'refund' },
    });
    expect(reembolso.statusCode).toBe(200);
    expect(reembolso.json().transferType).toBe('refund');
    expect(await medir()).toEqual(antes);

    const auditorias = await prisma.transactionAudit.findMany({
      where: { transactionId: tx.id, action: 'update' },
      orderBy: { at: 'asc' },
    });
    // Uma auditoria por mudança: marcar na fila, desfazer, marcar como reembolso
    const mudanca = (a: (typeof auditorias)[number]) => [
      (a.before as { transferType: unknown }).transferType,
      (a.after as { transferType: unknown }).transferType,
    ];
    expect(auditorias.map(mudanca)).toEqual([
      [null, 'own_account'],
      ['own_account', null],
      [null, 'refund'],
    ]);
  });

  it('lançamentos: receita já aprovada pode ser marcada como reembolso e desmarcada', async () => {
    const { entrada } = await importar('180.40');
    const antes = await medir();

    const aprovada = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(),
      payload: { bankTransactionId: entrada, categoryId: null },
    });
    expect(aprovada.statusCode).toBe(200);
    const txId = aprovada.json().id as string;
    expect(await medir()).toEqual(somar(antes, 18040));

    const marcar = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${txId}/non-income`,
      headers: auth(),
      payload: { reason: 'refund' },
    });
    expect(marcar.statusCode).toBe(200);
    expect(await medir()).toEqual(antes);

    // A listagem expõe o motivo para a tela mostrar o selo "Não é renda"
    const item = await app.inject({ method: 'GET', url: `/api/transactions/${txId}`, headers: auth() });
    expect(item.json().transferType).toBe('refund');

    const desmarcar = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${txId}/non-income`,
      headers: auth(),
      payload: { reason: null },
    });
    expect(desmarcar.statusCode).toBe(200);
    expect(await medir()).toEqual(somar(antes, 18040));
  });

  it('saída da fila não pode ser "não é renda": 400 e o item continua pendente', async () => {
    const { saida } = await importar('11.11');
    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(),
      payload: { bankTransactionId: saida, nonIncomeReason: 'refund' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NON_INCOME_ONLY_FOR_INCOME');
    const bank = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: saida } });
    expect(bank.status).toBe('nova');
    expect(bank.importedTransactionId).toBeNull();
  });

  it('motivo inválido é recusado pelo schema (fila e lançamentos)', async () => {
    const { entrada } = await importar('12.12');
    const fila = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(),
      payload: { bankTransactionId: entrada, nonIncomeReason: 'transfer' },
    });
    expect(fila.statusCode).toBe(400);
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: entrada } })).status).toBe('nova');

    const aprovada = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(),
      payload: { bankTransactionId: entrada },
    });
    const txId = aprovada.json().id as string;
    for (const payload of [{ reason: 'pro_labore' }, {}, { reason: 'refund', extra: 1 }]) {
      const res = await app.inject({ method: 'PUT', url: `/api/transactions/${txId}/non-income`, headers: auth(), payload });
      expect(res.statusCode).toBe(400);
    }
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(tx.transferType).toBeNull();
  });

  it('despesa e perna de transferência não podem ser marcadas', async () => {
    const { saida } = await importar('13.13');
    const despesa = (
      await app.inject({ method: 'POST', url: '/api/imports/approve', headers: auth(), payload: { bankTransactionId: saida } })
    ).json();
    const resDespesa = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${despesa.id}/non-income`,
      headers: auth(),
      payload: { reason: 'refund' },
    });
    expect(resDespesa.statusCode).toBe(400);
    expect(resDespesa.json().code).toBe('NON_INCOME_ONLY_FOR_INCOME');

    const retirada = await app.inject({
      method: 'POST',
      url: '/api/owner-withdrawals',
      headers: auth(),
      payload: { amount: '50.00', occurredOn: dia },
    });
    expect(retirada.statusCode).toBe(201);
    const pernaPf = retirada.json().legPf as { id: string };
    const resPerna = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${pernaPf.id}/non-income`,
      headers: auth(),
      payload: { reason: 'own_account' },
    });
    expect(resPerna.statusCode).toBe(400);
    expect(resPerna.json().code).toBe('NON_INCOME_TRANSFER_LEG');
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: pernaPf.id } })).transferType).toBe('pro_labore');
  });

  it('recurso de outro workspace: 404 na fila e nos lançamentos, sem alterar nada', async () => {
    const { entrada } = await importar('99.90');
    const fila = await app.inject({
      method: 'POST',
      url: '/api/imports/approve',
      headers: auth(tokenOutro),
      payload: { bankTransactionId: entrada, nonIncomeReason: 'own_account' },
    });
    expect(fila.statusCode).toBe(404);
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: entrada } })).status).toBe('nova');

    const aprovada = (
      await app.inject({ method: 'POST', url: '/api/imports/approve', headers: auth(), payload: { bankTransactionId: entrada } })
    ).json();
    const alheio = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${aprovada.id}/non-income`,
      headers: auth(tokenOutro),
      payload: { reason: 'refund' },
    });
    expect(alheio.statusCode).toBe(404);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: aprovada.id } })).transferType).toBeNull();
  });
});
