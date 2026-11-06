// Provas do module-hardening do ledger. Rodar via run.sh (banco descartável).
// Cada linha: [ID] observado | esperado. IDs batem com os ledgers em ../ledgers/.
import { buildApp } from '../../../../backend/src/app.ts';
import prisma from '../../../../backend/src/config/prisma.ts';
import { createTransaction, createTransfer, deleteTransaction, listTransactions } from '../../../../backend/src/modules/ledger/public.ts';
import { getMeiLimit } from '../../../../backend/src/modules/fiscal/public.ts';
import { resolveScopeForUser } from '../../../../backend/src/modules/workspace/public.ts';
import { LocalDate, assertCanWrite } from '../../../../backend/src/shared/index.ts';

const app = await buildApp({ logger: false });
await app.ready();
const D = '2026-11-04';
const out = (id: string, observed: unknown, expected: string) =>
  console.log(`[${id}] ${JSON.stringify(observed)}  | esperado: ${expected}`);

async function user(tag: string) {
  const email = `${tag}-${Date.now()}@probe.test`;
  await app.inject({ method: 'POST', url: '/api/register', payload: { name: `P ${tag}`, email, password: 'ProbePassword123', accountType: 'mei' } });
  const token = (await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'ProbePassword123' } })).json().token;
  const userId = (await prisma.user.findFirst({ where: { email } }))!.id;
  const scope = await resolveScopeForUser(userId);
  const cats = await prisma.category.findMany({ where: { workspaceId: scope.workspaceId } });
  return { auth: { authorization: `Bearer ${token}` }, scope, cats };
}
const A = await user('a');
const B = await user('b');
const desp = A.cats.filter((c) => c.type === 'despesa');
const rec = A.cats.find((c) => c.type === 'receita')!;
const pj = A.scope.defaultEntityIds.pj!;
const splitsSum = async (id: string) =>
  (await prisma.transactionSplit.findMany({ where: { transactionId: id } })).reduce((s, x) => s + Number(x.amount), 0);
const split6040 = () => [{ categoryId: desp[0]!.id, amount: '60.00' }, { categoryId: desp[1]!.id, amount: '40.00' }];

// --- autorização e isolamento
{ let r: string; try { assertCanWrite({ ...A.scope, role: 'guest' as never }); r = 'passou'; } catch (e) { r = (e as Error).constructor.name; }
  out('P-S1 papel desconhecido escreve?', r, 'ForbiddenError'); }
{ const r = await app.inject({ method: 'POST', url: '/api/transactions', headers: A.auth, payload: { description: 'idor', amount: '10.00', type: 'despesa', categoryId: desp[0]!.id, transactionDate: D, entityId: B.scope.defaultEntityIds.pf } });
  out('P-TS1 POST com entityId de outro workspace', r.statusCode, '404'); }
{ const catB = B.cats.find((c) => c.type === 'despesa')!;
  const r = await createTransaction(A.scope, { type: 'despesa', amount: '1.00', description: 'cat', occurredOn: D, status: 'pendente_revisao', categoryId: catB.id }).then(() => 'gravou').catch((e) => e.message);
  out('P-CT1 categoria de outro workspace (pendente)', r, 'erro de validação'); }

// --- datas
{ const res = ['04/11/2026', '2026', '1', '2026-11-4', '31/02/2026'].map((s) => { try { return [s, LocalDate.fromInput(s).toIsoDate()]; } catch { return [s, 'ERRO']; } });
  out('P-C1 LocalDate.fromInput', res, '04/11/2026→2026-11-04; demais ERRO'); }

// --- dinheiro / resumo
{ await createTransaction(A.scope, { type: 'despesa', amount: '250.00', description: 'neg', occurredOn: D, categoryId: desp[0]!.id });
  const r = await listTransactions(A.scope, {}).then((x) => x.resumo.resultado).catch((e) => `ERRO ${e.message}`);
  out('P-LT1 resultado negativo na listagem', r, '"-250.00" sem erro'); }

// --- transferências
{ const accPf = await prisma.financialAccount.create({ data: { workspaceId: A.scope.workspaceId, entityId: A.scope.defaultEntityIds.pf, kind: 'banco', name: 'PF' } });
  const accPj = await prisma.financialAccount.create({ data: { workspaceId: A.scope.workspaceId, entityId: pj, kind: 'banco', name: 'PJ' } });
  const mei = async () => ((await getMeiLimit(A.scope, { year: 2026, entityId: pj } as never)) as { faturamentoAno: string }).faturamentoAno;
  const dash = async () => (await app.inject({ method: 'GET', url: '/api/dashboard', headers: A.auth })).json().periodo;
  const res = async () => (await listTransactions(A.scope, {})).resumo;
  const [m0, d0, r0] = [await mei(), await dash(), await res()];
  await createTransfer(A.scope, { fromAccountId: accPf.id, toAccountId: accPj.id, amount: '10000.00', occurredOn: D });
  const [m1, d1, r1] = [await mei(), await dash(), await res()];
  out('P-TR1a limite MEI após transferência PF→PJ de 10000', [m0, m1], 'inalterado');
  out('P-TR1b dashboard período (entradas, despesas)', { entradas: [d0?.totalEntradas, d1?.totalEntradas], despesas: [d0?.totalDespesas, d1?.totalDespesas] }, 'inalterados');
  out('P-TR1c resumo do ledger (entradas, despesas)', { entradas: [r0.totalEntradas, r1.totalEntradas], despesas: [r0.totalDespesas, r1.totalDespesas] }, 'inalterados'); }
{ const w = (await app.inject({ method: 'POST', url: '/api/owner-withdrawals', headers: A.auth, payload: { amount: '300.00', occurredOn: D } })).json();
  await app.inject({ method: 'DELETE', url: `/api/transactions/${w.legPj.id}`, headers: A.auth });
  out('P-orfa DELETE de uma perna (legado): pernas vivas', await prisma.transaction.count({ where: { transferGroupId: w.transferGroupId, deletedAt: null } }), '0'); }
{ const w = (await app.inject({ method: 'POST', url: '/api/owner-withdrawals', headers: A.auth, payload: { amount: '50.00', occurredOn: D } })).json();
  const t = await app.inject({ method: 'PUT', url: `/api/transactions/${w.legPj.id}`, headers: A.auth, payload: { type: 'receita' } });
  out('P-TS5 PUT type em lançamento sem categoria', t.statusCode, '400');
  const r = await app.inject({ method: 'PUT', url: `/api/transactions/${w.legPf.id}`, headers: A.auth, payload: { amount: '1.00' } });
  const legs = await prisma.transaction.findMany({ where: { transferGroupId: w.transferGroupId }, select: { amount: true } });
  out('P-TS4 PUT amount numa perna de transferência', { status: r.statusCode, pernas: legs.map((l) => l.amount.toString()) }, '400 ou par alinhado'); }

// --- splits
{ const tx = await createTransaction(A.scope, { type: 'despesa', amount: '100.00', description: 'split', occurredOn: D, splits: split6040() });
  const r = await app.inject({ method: 'PUT', url: `/api/transactions/${tx.id}`, headers: A.auth, payload: { amount: '999.00' } });
  out('P-UT1 PUT amount divergente dos splits', r.statusCode, '400'); }

// --- idempotência
{ const ref = `race:${Date.now()}`;
  const res = await Promise.allSettled(Array.from({ length: 8 }, () => createTransaction(A.scope, { type: 'receita', amount: '5.00', description: 'race', occurredOn: D, categoryId: rec.id, sourceRef: ref })));
  out('P-CT3 8 creates simultâneos, mesmo sourceRef', { ok: res.filter((r) => r.status === 'fulfilled').length }, '8'); }
{ const ref = `nfe:N1${Date.now()}`;
  const t1 = await createTransaction(A.scope, { type: 'despesa', amount: '100.00', description: 'nota', occurredOn: D, sourceRef: ref, splits: split6040() });
  await deleteTransaction(A.scope, t1.id);
  const t2 = await createTransaction(A.scope, { type: 'despesa', amount: '30.00', description: 'nota', occurredOn: D, sourceRef: ref, categoryId: desp[0]!.id });
  out('P-N1 restaurar (ledger) dividido sem splits', { total: t2.amount.toString(), temCategoria: !!t2.categoryId, somaSplits: await splitsSum(t2.id) }, 'somaSplits 0 (splits antigos removidos)'); }
{ const ref = `nfe:N2${Date.now()}`;
  const t1 = await createTransaction(A.scope, { type: 'despesa', amount: '100.00', description: 'nota', occurredOn: D, sourceRef: ref, splits: split6040() });
  await deleteTransaction(A.scope, t1.id);
  const res = await Promise.allSettled(Array.from({ length: 6 }, () => createTransaction(A.scope, { type: 'despesa', amount: '100.00', description: 'nota', occurredOn: D, sourceRef: ref, splits: split6040() })));
  out('P-N2 6 restaurações simultâneas (total 100)', { ok: res.filter((r) => r.status === 'fulfilled').length, somaSplits: await splitsSum(t1.id), auditsRestore: await prisma.transactionAudit.count({ where: { transactionId: t1.id, action: 'restore' } }) }, 'somaSplits 100, 1 audit de restore'); }
{ const ref = `nfe:N3${Date.now()}`;
  const t1 = await createTransaction(A.scope, { type: 'despesa', amount: '100.00', description: 'nota', occurredOn: D, sourceRef: ref, splits: split6040() });
  await deleteTransaction(A.scope, t1.id);
  const r = await app.inject({ method: 'POST', url: '/api/transactions', headers: A.auth, payload: { description: 'manual', amount: '7.00', type: 'despesa', categoryId: desp[0]!.id, transactionDate: D, sourceRef: ref } });
  out('P-N3 restaurar pelo legado', { status: r.statusCode, total: r.json().amount, somaSplits: await splitsSum(t1.id), audits: await prisma.transactionAudit.count({ where: { transactionId: t1.id } }) }, 'splits removidos + audit de restore'); }
{ const ref = `pluggy:ext-${Date.now()}`;
  await app.inject({ method: 'POST', url: '/api/transactions', headers: A.auth, payload: { description: 'manual', amount: '1.00', type: 'receita', categoryId: rec.id, transactionDate: D, sourceRef: ref } });
  const imp = await createTransaction(A.scope, { type: 'receita', amount: '5000.00', description: 'PIX banco', occurredOn: D, categoryId: rec.id, origin: 'importacao', sourceRef: ref });
  out('P-N4 cliente ocupa sourceRef do Open Finance', { devolvido: imp.amount.toString(), origin: imp.origin }, 'importação de 5000 gravada'); }

// --- rodada 3 (commits 5fe168c..4969978): resíduos das correções
{ // N4b: lista de bloqueio cobre todos os namespaces internos?
  const refs = ['pluggy:x', 'ofx:x', 'csv:x', 'proposal:x', 'tg:msg:1', 'tg:photo:x', 'PLUGGY:x'];
  const res: Record<string, number> = {};
  for (const ref of refs) {
    const r = await app.inject({ method: 'POST', url: '/api/transactions', headers: A.auth, payload: { description: 'ns', amount: '1.00', type: 'receita', categoryId: rec.id, transactionDate: D, sourceRef: `${ref}${Date.now()}` } });
    res[ref] = r.statusCode;
  }
  out('P-N4b sourceRef interno aceito pelo POST legado?', res, 'todos 400');
  const ref = `csv:hash-${Date.now()}`;
  await app.inject({ method: 'POST', url: '/api/transactions', headers: A.auth, payload: { description: 'manual', amount: '1.00', type: 'receita', categoryId: rec.id, transactionDate: D, sourceRef: ref } });
  const imp = await createTransaction(A.scope, { type: 'receita', amount: '5000.00', description: 'extrato CSV', occurredOn: D, categoryId: rec.id, origin: 'importacao', sourceRef: ref });
  out('P-N4c cliente ocupa sourceRef de importação CSV', { devolvido: imp.amount.toString(), origin: imp.origin }, 'importação de 5000 gravada'); }
{ // TR1d: resumo da tela de Lançamentos (GET /api/transactions, legado)
  const C = await user('c');
  const pjC = C.scope.defaultEntityIds.pj!;
  const aPf = await prisma.financialAccount.create({ data: { workspaceId: C.scope.workspaceId, entityId: C.scope.defaultEntityIds.pf, kind: 'banco', name: 'PF' } });
  const aPj = await prisma.financialAccount.create({ data: { workspaceId: C.scope.workspaceId, entityId: pjC, kind: 'banco', name: 'PJ' } });
  const resumo = async () => (await app.inject({ method: 'GET', url: '/api/transactions', headers: C.auth })).json().resumo;
  const r0 = await resumo();
  await createTransfer(C.scope, { fromAccountId: aPf.id, toAccountId: aPj.id, amount: '10000.00', occurredOn: D });
  const r1 = await resumo();
  out('P-TR1d resumo GET /api/transactions (legado)', { entradas: [r0.totalEntradas, r1.totalEntradas], despesas: [r0.totalDespesas, r1.totalDespesas] }, 'inalterados'); }
{ // TS4b: outros campos de perna de transferência
  const w = (await app.inject({ method: 'POST', url: '/api/owner-withdrawals', headers: A.auth, payload: { amount: '80.00', occurredOn: D } })).json();
  const r = await app.inject({ method: 'PUT', url: `/api/transactions/${w.legPf.id}`, headers: A.auth, payload: { transactionDate: '2026-12-25' } });
  const legs = await prisma.transaction.findMany({ where: { transferGroupId: w.transferGroupId }, select: { transactionDate: true } });
  out('P-TS4b PUT data numa perna de transferência', { status: r.statusCode, datas: legs.map((l) => l.transactionDate.toISOString().slice(0, 10)) }, '400 ou datas alinhadas'); }
{ // WH: webhook do Telegram
  const sem = await app.inject({ method: 'POST', url: '/telegram/webhook', payload: { update_id: 1 } });
  const errado = await app.inject({ method: 'POST', url: '/telegram/webhook', headers: { 'x-telegram-bot-api-secret-token': 'errado' }, payload: { update_id: 1 } });
  out('P-WH webhook sem segredo / segredo errado', [sem.statusCode, errado.statusCode], '401 / 401'); }
{ // CFG: rotas de credenciais globais
  const p1 = await app.inject({ method: 'POST', url: '/api/openfinance/config', headers: A.auth, payload: { clientId: 'x', clientSecret: 'y' } });
  const p2 = await app.inject({ method: 'POST', url: '/api/assistant/config', headers: A.auth, payload: { apiKey: 'x' } });
  out('P-CFG POST de credenciais globais', [p1.statusCode, p2.statusCode], '404 / 404'); }
{ // N2b: eventos publicados numa restauração concorrente
  const { defaultEventBus } = await import('../../../../backend/src/shared/index.ts');
  let created = 0;
  defaultEventBus.subscribe('transaction.created', () => { created++; });
  const ref = `nfe:EV${Date.now()}`;
  const t1 = await createTransaction(A.scope, { type: 'despesa', amount: '10.00', description: 'ev', occurredOn: D, sourceRef: ref, categoryId: desp[0]!.id });
  await deleteTransaction(A.scope, t1.id);
  created = 0;
  await Promise.allSettled(Array.from({ length: 6 }, () => createTransaction(A.scope, { type: 'despesa', amount: '10.00', description: 'ev', occurredOn: D, sourceRef: ref, categoryId: desp[0]!.id })));
  out('P-N2b eventos transaction.created em 6 restaurações simultâneas', created, '1'); }

// --- rodada 4 (d20a900): deduplicação do Telegram
{ process.env.TELEGRAM_WEBHOOK_SECRET = 'probe_webhook_secret_with_32_chars_xx';
  const h = { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET };
  const updateId = 900000000 + Math.floor(Math.random() * 1000000);
  const upd = { update_id: updateId, message: { message_id: 1, date: 0, chat: { id: 4242, type: 'private' }, from: { id: 4242, is_bot: false, first_name: 'P' }, text: '/ajuda' } };
  const res = await Promise.all(Array.from({ length: 5 }, () => app.inject({ method: 'POST', url: '/telegram/webhook', headers: h, payload: upd })));
  const rows = await prisma.inboundUpdate.findMany({ where: { updateId: BigInt(updateId) } });
  out('P-TG1 5 entregas simultâneas do mesmo update_id', { http: [...new Set(res.map((r) => r.statusCode))], registros: rows.length, status: rows.map((r) => r.status) }, '1 registro, processada');
  // resíduo: update preso em "processando" (processo caiu no meio) nunca é reprocessado
  const stuckId = updateId + 1;
  await prisma.inboundUpdate.create({ data: { updateId: BigInt(stuckId), chatId: '4242', kind: 'text', status: 'processando' } });
  await app.inject({ method: 'POST', url: '/telegram/webhook', headers: h, payload: { ...upd, update_id: stuckId } });
  const stuck = await prisma.inboundUpdate.findUnique({ where: { updateId: BigInt(stuckId) } });
  out('P-TG2 reenvio de update preso em processando', { status: stuck?.status, processadoEm: stuck?.processedAt ?? null }, 'reprocessado após prazo (ou documentado como perda)'); }

await app.close();
await prisma.$disconnect();
