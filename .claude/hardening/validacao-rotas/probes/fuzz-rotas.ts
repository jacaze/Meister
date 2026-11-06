/**
 * Probe de fuzz adversarial das rotas de escrita (Etapa 3 — validação de entrada).
 *
 * Uso (dentro de backend/): PROBE_LABEL="ANTES|DEPOIS" npx tsx tests/hardening/fuzz-rotas.ts
 *
 * - Cada rota alvo é conferida com app.hasRoute(): se não existir, o probe FALHA (exit 2),
 *   para nunca contar 404 de "rota inexistente" como "sem 500".
 * - Marca 🔴 para qualquer 5xx e 🟡 para 2xx com corpo malformado (aceitação indevida),
 *   exceto em rotas que não leem o corpo (noBody).
 * - Usa um usuário descartável por execução (DELETE /api/me é a última chamada).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '../..'), '.env.test') });
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../../src/app.js');
const { default: prisma } = await import('../../src/config/prisma.js');
const { provisionWorkspace } = await import('../../src/modules/workspace/public.js');
const { createTransaction } = await import('../../src/modules/ledger/public.js');

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Target {
  method: Method;
  url: string; // template registrado no Fastify
  base: Record<string, unknown>; // corpo "válido" de referência (nomes de campos)
  noBody?: boolean; // rota que não lê o corpo: 2xx com corpo ruim é esperado
  public?: boolean; // sem Authorization
  last?: boolean; // executar por último (destrutiva)
  foreign?: 'transaction' | 'category'; // tipo de recurso do :id de outro workspace
}

const UUID0 = '00000000-0000-4000-8000-000000000000';

export const TARGETS: Target[] = [
  { method: 'POST', url: '/api/register', public: true, base: { name: 'Fulano', email: 'f@t.local', password: 'Senha123!', accountType: 'mei' } },
  { method: 'POST', url: '/api/login', public: true, base: { email: 'f@t.local', password: 'Senha123!' } },
  { method: 'POST', url: '/api/receipts/parse', base: { imageBase64: 'abc', mimeType: 'image/png', textOrQrUrl: 'http://x', entityId: UUID0 } },
  { method: 'POST', url: '/api/receipts/confirm', base: { total: '100.00', description: 'x', date: '2026-03-01', categoryId: UUID0, accessKey: 'k', splits: [] } },
  { method: 'POST', url: '/api/categories', base: { name: 'Cat', type: 'despesa' } },
  { method: 'PUT', url: '/api/categories/:id', foreign: 'category', base: { name: 'Cat', type: 'despesa' } },
  { method: 'DELETE', url: '/api/categories/:id', foreign: 'category', noBody: true, base: {} },
  { method: 'POST', url: '/api/consents', base: { type: 'terms', version: '1' } },
  { method: 'POST', url: '/api/transactions', base: { type: 'despesa', amount: '100.00', description: 'x', occurredOn: '2026-03-01', categoryId: UUID0 } },
  { method: 'PUT', url: '/api/transactions/:id', foreign: 'transaction', base: { description: 'x', amount: '100.00', type: 'despesa', categoryId: UUID0, paymentMethod: 'pix', transactionDate: '2026-03-01' } },
  { method: 'DELETE', url: '/api/transactions/:id', foreign: 'transaction', noBody: true, base: {} },
  { method: 'POST', url: '/api/transfers', base: { fromAccountId: UUID0, toAccountId: UUID0, amount: '10.00', occurredOn: '2026-03-01' } },
  { method: 'POST', url: '/api/owner-withdrawals', base: { amount: '10.00', occurredOn: '2026-03-01' } },
  { method: 'POST', url: '/api/telegram/link-token', noBody: true, base: {} },
  { method: 'POST', url: '/api/telegram/unlink', noBody: true, base: {} },
  { method: 'POST', url: '/api/das/:id/pay', base: { paidOn: '2026-03-01', paidAmount: '70.60' } },
  { method: 'DELETE', url: '/api/das/:id/pay', noBody: true, base: {} },
  { method: 'PATCH', url: '/api/me', base: { name: 'Novo', email: 'n@t.local', accountType: 'mei' } },
  { method: 'PUT', url: '/api/entities/:id/business-profile', base: { cnpj: '11222333000181', legalName: 'X', tradeName: 'Y', openedOn: '2026-01-01', activity: 'servicos' } },
  { method: 'POST', url: '/api/education/lessons/:slug/quiz', base: { answers: [0, 1] } },
  { method: 'POST', url: '/api/education/lessons/:slug/complete', noBody: true, base: {} },
  { method: 'POST', url: '/api/education/ask', base: { question: 'O que é MEI?', contextId: UUID0 } },
  { method: 'POST', url: '/api/education/nudges/:id/feedback', base: { helpful: true } },
  { method: 'POST', url: '/api/jars/plan', base: { templateSlug: 'seis-potes', baseMode: 'mes_atual', name: 'P', entityId: UUID0 } },
  { method: 'PATCH', url: '/api/jars/plan/:planId', base: { baseMode: 'mes_atual' } },
  { method: 'PUT', url: '/api/jars/categories', base: { planId: UUID0, jarId: UUID0, categoryIds: [UUID0] } },
  { method: 'PUT', url: '/api/jars/categories/batch', base: { planId: UUID0, mappings: [{ jarId: UUID0, categoryIds: [] }] } },
  { method: 'POST', url: '/api/openfinance/connect-token', noBody: true, base: {} },
  { method: 'POST', url: '/api/openfinance/connect-item', base: { itemId: 'item-1', entityId: UUID0 } },
  { method: 'POST', url: '/api/openfinance/connections/:id/sync', noBody: true, base: {} },
  { method: 'DELETE', url: '/api/openfinance/connections/:id', noBody: true, base: {} },
  { method: 'POST', url: '/api/insights/ask', base: { question: 'Como foi o mês?', entityId: UUID0 } },
  { method: 'POST', url: '/api/insights/run', noBody: true, base: {} },
  { method: 'POST', url: '/api/insights/:id/dismiss', noBody: true, base: {} },
  { method: 'POST', url: '/api/insights/:id/feedback', base: { helpful: true } },
  { method: 'POST', url: '/api/imports/statement', base: { content: 'OFX', provider: 'ofx', institution: 'Banco', entityId: UUID0 } },
  { method: 'POST', url: '/api/imports/approve', base: { bankTransactionId: UUID0, categoryId: UUID0, entityId: UUID0, viaPersonalAccount: false } },
  { method: 'POST', url: '/api/imports/batch-approve', base: { items: [{ bankTransactionId: UUID0 }] } },
  { method: 'POST', url: '/api/imports/ignore', base: { bankTransactionId: UUID0 } },
  { method: 'POST', url: '/api/assistant/chat', base: { message: 'Oi', history: [] } },
  { method: 'POST', url: '/api/assistant/receipt', base: { imageBase64: 'abc', mimeType: 'image/png', textOrQrUrl: 'http://x' } },
  { method: 'POST', url: '/api/assistant/proposals', base: { text: 'almoço 45', entityId: UUID0 } },
  { method: 'POST', url: '/api/assistant/proposals/:id/confirm', noBody: true, base: {} },
  { method: 'POST', url: '/api/assistant/proposals/:id/cancel', noBody: true, base: {} },
  { method: 'POST', url: '/telegram/webhook', public: true, base: { update_id: 1, message: { chat: { id: 1 }, text: 'oi' } } },
  { method: 'DELETE', url: '/api/me', noBody: true, last: true, base: {} },
];

function deepNested(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { leaf: 1 };
  for (let i = 0; i < depth; i++) obj = { level: obj };
  return obj;
}

function mapValues(base: Record<string, unknown>, fn: (k: string) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) out[k] = fn(k);
  return Object.keys(out).length ? out : { campo: fn('campo') };
}

interface Case {
  desc: string;
  payload?: unknown;
  raw?: string;
  contentType?: string;
}

function casesFor(t: Target): Case[] {
  const b = t.base;
  const bigStr = 'X'.repeat(1024 * 1024);
  return [
    { desc: 'corpo null', raw: 'null' },
    { desc: 'array no lugar de objeto []', payload: [] },
    { desc: 'Content-Type text/plain', raw: 'texto qualquer', contentType: 'text/plain' },
    { desc: 'objeto vazio {}', payload: {} },
    {
      desc: 'string de 1 MB nos campos',
      payload: mapValues(b, (k) => (Array.isArray(b[k]) ? [bigStr] : bigStr)),
    },
    { desc: 'objeto aninhado (50 níveis)', payload: mapValues(b, () => deepNested(50)) },
    { desc: 'chave __proto__', raw: '{"__proto__":{"admin":true}}' },
    { desc: 'chave constructor', raw: '{"constructor":{"prototype":{"x":1}}}' },
    { desc: 'campos como número 123', payload: mapValues(b, () => 123) },
    {
      desc: 'campo isolado com tipo inválido',
      payload: { baseMode: 123, items: 'abc', answers: 'abc', helpful: 'sim', update_id: 'abc' },
    },
    { desc: 'campos como objeto', payload: mapValues(b, () => ({ a: 1 })) },
    { desc: 'campos como null', payload: mapValues(b, () => null) },
    { desc: 'campos numéricos como "1500"', payload: mapValues(b, () => '1500') },
    { desc: 'campos como "1.500,00"', payload: mapValues(b, () => '1.500,00') },
    { desc: 'datas inválidas "2026-02-30"', payload: mapValues(b, () => '2026-02-30') },
  ];
}

export interface Result {
  route: string;
  desc: string;
  status: number;
  code?: string;
  flag: '' | '🔴' | '🟡';
}

export async function runFuzzProbe(): Promise<{ results: Result[]; missing: string[] }> {
  const trace = (m: string) => { if (process.env.PROBE_TRACE) console.error(`[setup] ${m}`); };
  trace('buildApp');
  const app = await buildApp({ logger: false });
  await app.ready();
  trace('ready');

  const missing: string[] = [];
  for (const t of TARGETS) {
    if (!app.hasRoute({ method: t.method, url: t.url })) missing.push(`${t.method} ${t.url}`);
  }

  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { name: 'Fuzz A', email: `fuzz_a_${stamp}@meister.test`, passwordHash: 'x', accountType: 'mei' },
  });
  const provA = await provisionWorkspace({ userId: user.id, accountType: 'mei', workspaceName: 'Fuzz A' });
  const userB = await prisma.user.create({
    data: { name: 'Fuzz B', email: `fuzz_b_${stamp}@meister.test`, passwordHash: 'x', accountType: 'mei' },
  });
  const provB = await provisionWorkspace({ userId: userB.id, accountType: 'mei', workspaceName: 'Fuzz B' });

  const catB = await prisma.category.create({
    data: { workspaceId: provB.workspaceId, name: 'Cat B', slug: 'cat-b', type: 'despesa' },
  });
  const txB = await createTransaction(provB.scope, {
    type: 'despesa',
    amount: '10.00',
    description: 'Do workspace B',
    occurredOn: '2026-03-01',
    categoryId: catB.id,
  } as never);
  const foreignIds = { transaction: (txB as { id: string }).id, category: catB.id };

  trace('fixtures ok');
  const token = app.jwt.sign(
    { sub: user.id, userId: user.id, email: user.email, wid: provA.workspaceId },
    { expiresIn: '1h' }
  );

  const ordered = [...TARGETS.filter((t) => !t.last), ...TARGETS.filter((t) => t.last)];
  const results: Result[] = [];
  let seq = 0; // IP distinto por requisição: evita que o rate limit (300/min por IP) mascare resultados

  for (const t of ordered) {
    const idCases: Array<{ desc: string; id: string }> = [];
    if (t.url.includes(':')) {
      idCases.push({ desc: ':id UUID inválido', id: 'nao-e-uuid' });
      idCases.push({ desc: ':id UUID inexistente', id: UUID0 });
      if (t.foreign) idCases.push({ desc: ':id de OUTRO workspace', id: foreignIds[t.foreign] });
    }
    const fill = (id: string) => t.url.replace(/:[a-zA-Z]+/g, id === '' ? UUID0 : id);

    const runs: Array<{ desc: string; url: string; c: Case }> = [];
    for (const c of casesFor(t)) runs.push({ desc: c.desc, url: fill(UUID0), c });
    for (const ic of idCases) {
      runs.push({ desc: ic.desc, url: fill(t.url.includes('/lessons/') ? 'licao-x' : ic.id), c: { desc: ic.desc, payload: t.base } });
    }

    for (const r of runs) {
      const headers: Record<string, string> = {
        'content-type': r.c.contentType ?? 'application/json',
        ...(t.public ? {} : { authorization: `Bearer ${token}` }),
      };
      if (t.url === '/telegram/webhook' && process.env.TELEGRAM_WEBHOOK_SECRET) {
        headers['x-telegram-bot-api-secret-token'] = process.env.TELEGRAM_WEBHOOK_SECRET;
      }
      if (process.env.PROBE_TRACE) console.error(`-> ${t.method} ${r.url} :: ${r.desc}`);
      let status = 500;
      let code: string | undefined;
      try {
        const res = await app.inject({
          method: t.method,
          url: r.url,
          remoteAddress: `10.${(seq >> 16) & 255}.${(seq >> 8) & 255}.${seq++ & 255}`,
          headers,
          payload: r.c.raw ?? (r.c.payload === undefined ? undefined : JSON.stringify(r.c.payload)),
        });
        status = res.statusCode;
        try {
          code = (res.json() as { code?: string }).code;
        } catch {
          code = undefined;
        }
      } catch (err) {
        code = `UNCAUGHT:${(err as Error).message}`;
      }
      const isBodyCase = !r.desc.startsWith(':id');
      const flag: Result['flag'] = status >= 500 ? '🔴' : isBodyCase && !t.noBody && status >= 200 && status < 300 ? '🟡' : '';
      results.push({ route: `${t.method} ${t.url}`, desc: r.desc, status, code, flag });
    }
  }

  await app.close();
  return { results, missing };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const label = process.env.PROBE_LABEL ?? 'PROBE';
  const { results, missing } = await runFuzzProbe();
  const n5xx = results.filter((r) => r.flag === '🔴').length;
  const n2xx = results.filter((r) => r.flag === '🟡').length;
  console.log(`# Probe de fuzz de rotas — ${label}\n`);
  console.log(`Rotas-alvo: ${TARGETS.length} | Rotas inexistentes: ${missing.length}`);
  if (missing.length) console.log(`INEXISTENTES: ${missing.join(', ')}`);
  console.log('\n| Rota | Cenário | Status | Código | Alerta |');
  console.log('|---|---|:---:|---|:---:|');
  for (const r of results) console.log(`| ${r.route} | ${r.desc} | ${r.status} | ${r.code ?? '-'} | ${r.flag} |`);
  console.log(`\nTotal de requisições: ${results.length}`);
  console.log(`🔴 Respostas 5xx: ${n5xx}`);
  const n429 = results.filter((r) => r.status === 429).length;
  console.log(`429 (rate limit — deve ser 0, senão o resultado está mascarado): ${n429}`);
  console.log(`🟡 2xx com corpo malformado (aceitação indevida, rotas que leem o corpo): ${n2xx}`);
  process.exit(missing.length ? 2 : n429 ? 3 : 0);
}
