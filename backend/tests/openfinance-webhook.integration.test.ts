import { createHmac } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { FakeClock, parseEnv } from '../src/shared/index.js';
import {
  syncPluggyConnection,
  type BankingAggregator,
  type PluggyAccountInfo,
  type PluggyItemInfo,
  type PluggyTransactionInfo,
} from '../src/modules/openfinance/public.js';

const STATIC_SECRET = 'pluggy_webhook_secret_valid_test_value_12345';
const WHSEC_SECRET = `whsec_${'a1b2c3d4'.repeat(8)}`;
const INTERNAL_TICK_SECRET = 'internal_tick_secret_valid_test_value_123456';

interface FakeAggregatorScript {
  accountsByItem?: Record<string, PluggyAccountInfo[]>;
  transactionsByAccount?: Record<string, PluggyTransactionInfo[]>;
  delayFetchAccountsMsByItem?: Record<string, number>;
  delayFetchTransactionsMsByAccount?: Record<string, number>;
  onFetchTransactions?: () => Promise<void>;
  fetchAccountsErrorByItem?: Record<string, Error>;
}

function createFakeAggregator(script: FakeAggregatorScript = {}) {
  const syncItemCalls: string[] = [];
  const fetchItemCalls: string[] = [];
  const fetchAccountsCalls: string[] = [];
  const fetchTransactionsCalls: string[] = [];

  const aggregator: BankingAggregator = {
    async validateCredentials() {
      return { valid: true };
    },
    async createConnectToken() {
      return 'fake-connect-token';
    },
    async fetchItem(itemId: string): Promise<PluggyItemInfo> {
      fetchItemCalls.push(itemId);
      return {
        id: itemId,
        status: 'UPDATED',
        connector: { id: 1, name: `Banco ${itemId}` },
        createdAt: '2026-11-01T00:00:00.000Z',
      };
    },
    async syncItem(itemId: string) {
      syncItemCalls.push(itemId);
      return { status: 'UPDATING' };
    },
    async fetchAccounts(itemId: string): Promise<PluggyAccountInfo[]> {
      fetchAccountsCalls.push(itemId);
      const delayMs = script.delayFetchAccountsMsByItem?.[itemId];
      if (delayMs && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const err = script.fetchAccountsErrorByItem?.[itemId];
      if (err) {
        throw err;
      }
      return (
        script.accountsByItem?.[itemId] ?? [
          {
            id: `ext-acc-${itemId}`,
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            name: `Conta ${itemId}`,
          },
        ]
      );
    },
    async fetchTransactions(accountId: string): Promise<PluggyTransactionInfo[]> {
      fetchTransactionsCalls.push(accountId);
      const delayMs = script.delayFetchTransactionsMsByAccount?.[accountId];
      if (delayMs && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (script.onFetchTransactions) {
        await script.onFetchTransactions();
      }
      return (
        script.transactionsByAccount?.[accountId] ?? [
          {
            id: `ext-tx-${accountId}-1`,
            description: 'Recebimento PIX Cliente',
            amount: 350.0,
            date: '2026-11-15',
            type: 'CREDIT',
          },
          {
            id: `ext-tx-${accountId}-2`,
            description: 'Pagamento Software Nuvem',
            amount: -120.0,
            date: '2026-11-16',
            type: 'DEBIT',
          },
        ]
      );
    },
  };

  return {
    aggregator,
    syncItemCalls,
    fetchItemCalls,
    fetchAccountsCalls,
    fetchTransactionsCalls,
  };
}

function signPluggyPayload(rawBody: string, secret: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${timestampSeconds},v1=${digest}`;
}

function buildTestEnv(overrides: Record<string, string | undefined> = {}) {
  return parseEnv({
    ...process.env,
    NODE_ENV: 'test',
    DEFAULT_TIMEZONE: 'America/Sao_Paulo',
    PLUGGY_WEBHOOK_SECRET: STATIC_SECRET,
    INTERNAL_TICK_SECRET,
    ...overrides,
  });
}

async function seedWorkspaceWithConnection(options: {
  itemId: string;
  status?: string;
  lastError?: string | null;
}) {
  const ws = await prisma.workspace.create({
    data: { name: `Workspace ${options.itemId}` },
  });
  const pf = await prisma.entity.create({
    data: { workspaceId: ws.id, kind: 'pf', name: 'PF Titular', isMei: false, active: true },
  });
  const pj = await prisma.entity.create({
    data: { workspaceId: ws.id, kind: 'pj', name: 'MEI Titular', isMei: true, active: true },
  });
  const conn = await prisma.bankConnection.create({
    data: {
      workspaceId: ws.id,
      provider: 'pluggy',
      itemId: options.itemId,
      institution: 'Banco Teste',
      status: options.status ?? 'ativa',
      lastError: options.lastError ?? null,
    },
  });
  return { ws, pf, pj, conn };
}

describe('Webhook da Pluggy /api/openfinance/webhook (Tarefa 09)', () => {
  const openedApps: FastifyInstance[] = [];

  async function openTestApp(options: {
    webhookSecret?: string;
    clock?: FakeClock;
    bankingAggregator?: BankingAggregator;
  } = {}): Promise<FastifyInstance> {
    const app = await buildApp({
      env: buildTestEnv({
        PLUGGY_WEBHOOK_SECRET: options.webhookSecret ?? STATIC_SECRET,
      }),
      logger: false,
      clock: options.clock,
      bankingAggregator: options.bankingAggregator,
    });
    await app.ready();
    openedApps.push(app);
    return app;
  }

  async function closeTrackedApp(app: FastifyInstance): Promise<void> {
    const idx = openedApps.indexOf(app);
    if (idx >= 0) {
      openedApps.splice(idx, 1);
    }
    await app.close();
  }

  beforeEach(async () => {
    await prisma.workspace.deleteMany();
  });

  afterEach(async () => {
    while (openedApps.length > 0) {
      const app = openedApps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany();
    await prisma.$disconnect();
  });

  it('autenticação: segredo não configurado responde 404; cabeçalho estático e assinatura HMAC são verificados em tempo constante e sem fallback', async () => {
    // 1. Segredo vazio / apenas espaços -> 404
    for (const disabledSecret of ['', '   ']) {
      const disabledApp = await openTestApp({ webhookSecret: disabledSecret });
      const res = await disabledApp.inject({
        method: 'POST',
        url: '/api/openfinance/webhook',
        headers: { 'x-webhook-secret': STATIC_SECRET },
        payload: { event: 'item/updated', itemId: 'item-1' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('PLUGGY_WEBHOOK_DISABLED');
    }

    // 2. Segredo estático (sem whsec_)
    const staticApp = await openTestApp({ webhookSecret: STATIC_SECRET });

    // Sem credencial -> 401
    const resMissing = await staticApp.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      payload: { event: 'item/updated', itemId: 'item-1' },
    });
    expect(resMissing.statusCode).toBe(401);
    expect(resMissing.json().code).toBe('INVALID_PLUGGY_WEBHOOK_SECRET');

    // Segredo errado -> 401
    const resWrong = await staticApp.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': 'x'.repeat(STATIC_SECRET.length) },
      payload: { event: 'item/updated', itemId: 'item-1' },
    });
    expect(resWrong.statusCode).toBe(401);

    // JSON malformado SEM autenticação -> 401 (não pode vazar 400 antes do check de segredo)
    const resMalformedUnauth = await staticApp.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'content-type': 'application/json' },
      payload: '{broken-json',
    });
    expect(resMalformedUnauth.statusCode).toBe(401);

    // Aceita X-Webhook-Secret, X-Pluggy-Webhook-Secret e Authorization: Bearer com trim
    for (const headers of [
      { 'x-webhook-secret': STATIC_SECRET },
      { 'x-pluggy-webhook-secret': `  ${STATIC_SECRET}  ` },
      { authorization: `Bearer ${STATIC_SECRET}` },
    ]) {
      const okRes = await staticApp.inject({
        method: 'POST',
        url: '/api/openfinance/webhook',
        headers,
        payload: { event: 'connector/status_updated' },
      });
      expect(okRes.statusCode).toBe(202);
    }

    // Se X-Pluggy-Signature vier inválido, NÃO faz fallback para X-Webhook-Secret válido -> 401
    const badSigEvenWithStatic = await staticApp.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: {
        'x-webhook-secret': STATIC_SECRET,
        'x-pluggy-signature': 't=1700000000,v1=' + '0'.repeat(64),
      },
      payload: { event: 'connector/status_updated' },
    });
    expect(badSigEvenWithStatic.statusCode).toBe(401);

    // 3. Segredo whsec_ -> HMAC obrigatório (sem fallback para cabeçalho estático) e janela anti-replay ±5 min
    const clock = new FakeClock('2026-11-21T15:00:00.000Z');
    const nowSec = Math.floor(clock.now().getTime() / 1000);
    const hmacApp = await openTestApp({ webhookSecret: WHSEC_SECRET, clock });
    const rawBody = JSON.stringify({ event: 'connector/status_updated', eventId: 'evt-hmac-1' });

    const staticFallbackBlocked = await hmacApp.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': WHSEC_SECRET,
        'x-pluggy-webhook-secret': WHSEC_SECRET,
        authorization: `Bearer ${WHSEC_SECRET}`,
      },
      payload: rawBody,
    });
    expect(staticFallbackBlocked.statusCode).toBe(401);

    // Assinatura válida dentro e nos limites exatos da janela (±300s) -> 202
    for (const ts of [nowSec, nowSec - 300, nowSec + 300]) {
      const validSigRes = await hmacApp.inject({
        method: 'POST',
        url: '/api/openfinance/webhook',
        headers: {
          'content-type': 'application/json',
          'x-pluggy-signature': signPluggyPayload(rawBody, WHSEC_SECRET, ts),
        },
        payload: rawBody,
      });
      expect(validSigRes.statusCode).toBe(202);
    }

    // Corpo adulterado depois da assinatura -> 401
    const tamperedSigRes = await hmacApp.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: {
        'content-type': 'application/json',
        'x-pluggy-signature': signPluggyPayload(rawBody, WHSEC_SECRET, nowSec),
      },
      payload: JSON.stringify({ event: 'item/deleted', itemId: 'item-1' }),
    });
    expect(tamperedSigRes.statusCode).toBe(401);

    // Timestamp expirado (-301s) ou muito adiantado (+301s) -> 401
    for (const staleTs of [nowSec - 301, nowSec + 301]) {
      const staleRes = await hmacApp.inject({
        method: 'POST',
        url: '/api/openfinance/webhook',
        headers: {
          'content-type': 'application/json',
          'x-pluggy-signature': signPluggyPayload(rawBody, WHSEC_SECRET, staleTs),
        },
        payload: rawBody,
      });
      expect(staleRes.statusCode).toBe(401);
    }
  });

  it('validação de payload: corpo malformado, sem event, evento de item sem itemId e transactions/deleted sem transactionIds retornam 400', async () => {
    const app = await openTestApp();

    const invalidRequests: Array<{ contentType?: string; payload: unknown }> = [
      { contentType: 'application/json', payload: '{broken-json' },
      { payload: ['not-an-object'] },
      { payload: {} },
      { payload: { event: '   ' } },
      { payload: { event: 'item/updated' } },
      { payload: { event: 'item/error' } },
      { payload: { event: 'transactions/deleted', itemId: 'item-1' } },
      { payload: { event: 'transactions/deleted', itemId: 'item-1', transactionIds: 'bad-type' } },
    ];

    for (const req of invalidRequests) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/openfinance/webhook',
        headers: {
          'x-webhook-secret': STATIC_SECRET,
          ...(req.contentType ? { 'content-type': req.contentType } : {}),
        },
        payload: req.payload as string | Record<string, unknown>,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('itemId desconhecido e connector/status_updated respondem 202 e não alteram nada no banco', async () => {
    const { conn } = await seedWorkspaceWithConnection({
      itemId: 'item-conhecido',
      status: 'ativa',
    });
    const fake = createFakeAggregator();
    const app = await openTestApp({ bankingAggregator: fake.aggregator });

    const resUnknown = await app.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/updated', itemId: 'item-desconhecido', eventId: 'evt-unk' },
    });
    expect(resUnknown.statusCode).toBe(202);
    expect(resUnknown.json()).toEqual({ received: true });

    const resConnector = await app.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'connector/status_updated', eventId: 'evt-conn' },
    });
    expect(resConnector.statusCode).toBe(202);

    await closeTrackedApp(app);

    const connAfter = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(connAfter.status).toBe('ativa');
    expect(connAfter.lastError).toBeNull();
    expect(fake.fetchItemCalls).toHaveLength(0);
    expect(fake.syncItemCalls).toHaveLength(0);
  });

  it('item/updated e transactions/created sincronizam via fetch sem chamar syncItem e são idempotentes em reenvios', async () => {
    const { conn } = await seedWorkspaceWithConnection({
      itemId: 'item-sync-ok',
      status: 'erro',
      lastError: 'Falha transitória anterior',
    });
    const fake = createFakeAggregator();
    const app1 = await openTestApp({ bankingAggregator: fake.aggregator });

    const res1 = await app1.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/updated', itemId: 'item-sync-ok', eventId: 'evt-upd-1' },
    });
    expect(res1.statusCode).toBe(202);

    const res2 = await app1.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'transactions/created', itemId: 'item-sync-ok', eventId: 'evt-tx-1' },
    });
    expect(res2.statusCode).toBe(202);

    await closeTrackedApp(app1);

    // Nunca dispara client.syncItem() a partir do webhook (evita loop infinito com a Pluggy)
    expect(fake.syncItemCalls).toEqual([]);
    expect(fake.fetchItemCalls).toEqual(['item-sync-ok', 'item-sync-ok']);
    expect(fake.fetchAccountsCalls).toEqual(['item-sync-ok', 'item-sync-ok']);

    const txsAfter = await prisma.bankTransaction.findMany({
      where: { connectionId: conn.id },
      orderBy: { externalId: 'asc' },
    });
    expect(txsAfter).toHaveLength(2);
    expect(txsAfter.map((t) => t.status)).toEqual(['nova', 'nova']);

    const connAfter = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(connAfter.status).toBe('ativa');
    expect(connAfter.lastError).toBeNull();
    expect(connAfter.lastSyncAt).not.toBeNull();
  });

  it('ciclo de vida do item: item/error (com consentExpiresAt e lastError genérico), item/waiting_user_input, item/login_succeeded e item/deleted (estado terminal)', async () => {
    const { conn } = await seedWorkspaceWithConnection({
      itemId: 'item-lifecycle',
      status: 'ativa',
    });
    const fake = createFakeAggregator();

    // 1. item/error com mensagem bruta sensível no payload -> lastError genérico (não ecoa payload bruto) + consentExpiresAt
    const app1 = await openTestApp({ bankingAggregator: fake.aggregator });
    const rawLeakedDetails = 'Credencial interna senha_banco_xyz CPF 111.222.333-44 expirada';
    const resErr1 = await app1.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: {
        event: 'item/error',
        itemId: 'item-lifecycle',
        consentExpiresAt: '2026-12-31T23:59:59.000Z',
        error: { code: 'INVALID_CREDENTIALS', message: rawLeakedDetails },
      },
    });
    const resErr2 = await app1.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: {
        event: 'item/error',
        itemId: 'item-lifecycle',
        consentExpiresAt: '2026-12-31T23:59:59.000Z',
        error: { code: 'INVALID_CREDENTIALS', message: rawLeakedDetails },
      },
    });
    expect(resErr1.statusCode).toBe(202);
    expect(resErr2.statusCode).toBe(202);
    await closeTrackedApp(app1);

    let state = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(state.status).toBe('erro');
    expect(state.lastError).toBeTruthy();
    expect(state.lastError).not.toContain('111.222.333-44');
    expect(state.lastError).not.toContain('senha_banco_xyz');
    expect(state.consentExpiresAt?.toISOString()).toBe('2026-12-31T23:59:59.000Z');

    // 2. item/login_succeeded em conexão em erro -> 'atualizando' e limpa lastError
    const app2 = await openTestApp({ bankingAggregator: fake.aggregator });
    const resLogin = await app2.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/login_succeeded', itemId: 'item-lifecycle' },
    });
    expect(resLogin.statusCode).toBe(202);
    await closeTrackedApp(app2);

    state = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(state.status).toBe('atualizando');
    expect(state.lastError).toBeNull();

    // 3. item/waiting_user_input -> volta para 'erro' com orientação genérica
    const app3 = await openTestApp({ bankingAggregator: fake.aggregator });
    const resWaiting = await app3.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/waiting_user_input', itemId: 'item-lifecycle' },
    });
    expect(resWaiting.statusCode).toBe(202);
    await closeTrackedApp(app3);

    state = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(state.status).toBe('erro');
    expect(state.lastError).toBeTruthy();

    // 4. item/deleted -> 'revogada' (terminal); eventos seguintes não reativam nem chamam Pluggy
    const app4 = await openTestApp({ bankingAggregator: fake.aggregator });
    await app4.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/deleted', itemId: 'item-lifecycle' },
    });
    await app4.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/updated', itemId: 'item-lifecycle' },
    });
    await app4.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/login_succeeded', itemId: 'item-lifecycle' },
    });
    await app4.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/error', itemId: 'item-lifecycle' },
    });
    await closeTrackedApp(app4);

    state = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(state.status).toBe('revogada');
    expect(fake.fetchItemCalls).toHaveLength(0);
  });

  it('transactions/deleted marca nova e casada como removida sem alterar lançamentos já importados nem outra conexão', async () => {
    const { ws, pf, conn } = await seedWorkspaceWithConnection({
      itemId: 'item-del-tx',
      status: 'ativa',
    });
    const other = await seedWorkspaceWithConnection({
      itemId: 'item-outra-conn',
      status: 'ativa',
    });

    const ledgerTx = await prisma.transaction.create({
      data: {
        workspaceId: ws.id,
        entityId: pf.id,
        type: 'receita',
        direction: 'in',
        description: 'Receita já aprovada no ledger',
        amount: '1500.00',
        transactionDate: new Date('2026-11-10T00:00:00.000Z'),
        origin: 'importacao',
        sourceRef: 'pluggy:tx-importada-1',
      },
    });

    await prisma.bankTransaction.createMany({
      data: [
        {
          connectionId: conn.id,
          provider: 'pluggy',
          externalId: 'tx-nova-1',
          direction: 'out',
          amount: '99.90',
          occurredOn: new Date('2026-11-15T00:00:00.000Z'),
          description: 'Compra pendente',
          status: 'nova',
        },
        {
          connectionId: conn.id,
          provider: 'pluggy',
          externalId: 'tx-casada-1',
          direction: 'out',
          amount: '50.00',
          occurredOn: new Date('2026-11-15T00:00:00.000Z'),
          description: 'Compra casada',
          status: 'casada',
        },
        {
          connectionId: conn.id,
          provider: 'pluggy',
          externalId: 'tx-importada-1',
          direction: 'in',
          amount: '1500.00',
          occurredOn: new Date('2026-11-10T00:00:00.000Z'),
          description: 'Receita já importada',
          status: 'importada',
          importedTransactionId: ledgerTx.id,
        },
        {
          connectionId: other.conn.id,
          provider: 'pluggy',
          externalId: 'tx-outra-1',
          direction: 'out',
          amount: '20.00',
          occurredOn: new Date('2026-11-15T00:00:00.000Z'),
          description: 'Outra conexão',
          status: 'nova',
        },
      ],
    });

    const app = await openTestApp();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/openfinance/webhook',
        headers: { 'x-webhook-secret': STATIC_SECRET },
        payload: {
          event: 'transactions/deleted',
          itemId: 'item-del-tx',
          transactionIds: ['tx-nova-1', 'tx-casada-1', 'tx-importada-1', 'tx-outra-1', 'tx-inexistente'],
        },
      });
      expect(res.statusCode).toBe(202);
    }
    await closeTrackedApp(app);

    const byExtId = new Map(
      (await prisma.bankTransaction.findMany()).map((t) => [t.externalId, t])
    );
    expect(byExtId.get('tx-nova-1')?.status).toBe('removida');
    expect(byExtId.get('tx-casada-1')?.status).toBe('removida');
    // Importada e lançamento do ledger permanecem intactos
    expect(byExtId.get('tx-importada-1')?.status).toBe('importada');
    expect(byExtId.get('tx-importada-1')?.importedTransactionId).toBe(ledgerTx.id);
    const ledgerAfter = await prisma.transaction.findUnique({ where: { id: ledgerTx.id } });
    expect(ledgerAfter).not.toBeNull();
    expect(ledgerAfter?.deletedAt).toBeNull();
    // Outra conexão não sofre efeito cruzado (anti-IDOR)
    expect(byExtId.get('tx-outra-1')?.status).toBe('nova');
  });

  it('responde 202 rapidamente antes do sync lento concluir e finaliza no drain', async () => {
    const { conn } = await seedWorkspaceWithConnection({
      itemId: 'item-async-fast',
      status: 'ativa',
    });
    const fake = createFakeAggregator({
      delayFetchAccountsMsByItem: { 'item-async-fast': 400 },
    });
    const app = await openTestApp({ bankingAggregator: fake.aggregator });

    const startedAt = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': STATIC_SECRET },
      payload: { event: 'item/updated', itemId: 'item-async-fast' },
    });
    const elapsedMs = Date.now() - startedAt;

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ received: true });
    expect(elapsedMs).toBeLessThan(250);
    // Logo após responder 202, o sync lento ainda não gravou no banco
    expect(await prisma.bankTransaction.count({ where: { connectionId: conn.id } })).toBe(0);

    await closeTrackedApp(app);

    expect(await prisma.bankTransaction.count({ where: { connectionId: conn.id } })).toBe(2);
    const connAfter = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(connAfter.lastSyncAt).not.toBeNull();
  });

  it('concorrência webhook × tick: duas sincronizações simultâneas da mesma conexão tratam P2002 como duplicata sem falhar', async () => {
    const { ws, pf, pj, conn } = await seedWorkspaceWithConnection({
      itemId: 'item-race',
      status: 'ativa',
    });
    await prisma.bankAccount.create({
      data: {
        connectionId: conn.id,
        externalId: 'ext-acc-item-race',
        kind: 'conta_corrente',
        name: 'Conta Corrente Race',
        entityId: pf.id,
      },
    });

    const raceTransactions: PluggyTransactionInfo[] = Array.from({ length: 15 }, (_, idx) => ({
      id: `race-tx-${idx + 1}`,
      description: `Lancamento Concorrente ${idx + 1}`,
      amount: idx % 2 === 0 ? 100 + idx : -(50 + idx),
      date: '2026-11-18',
      type: idx % 2 === 0 ? 'CREDIT' : 'DEBIT',
    }));

    // Barreira para alinhar as duas chamadas exatamente antes de entrarem no loop findUnique + create
    let arrived = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    const fake = createFakeAggregator({
      accountsByItem: {
        'item-race': [
          {
            id: 'ext-acc-item-race',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            name: 'Conta Corrente Race',
          },
        ],
      },
      transactionsByAccount: {
        'ext-acc-item-race': raceTransactions,
      },
      onFetchTransactions: async () => {
        arrived += 1;
        if (arrived >= 2) {
          releaseBarrier();
          return;
        }
        await Promise.race([
          barrier,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
      },
    });

    const scope = {
      workspaceId: ws.id,
      actorUserId: 'system:pluggy-webhook',
      role: 'owner' as const,
      defaultEntityIds: { pf: pf.id },
      visibleEntityIds: [pf.id, pj.id],
      ownEntityIds: [],
    };

    const [resA, resB] = await Promise.all([
      syncPluggyConnection(scope, {
        connectionId: conn.id,
        aggregator: fake.aggregator,
      }),
      syncPluggyConnection(scope, {
        connectionId: conn.id,
        aggregator: fake.aggregator,
      }),
    ]);

    expect(resA.importedTransactionsCount + resB.importedTransactionsCount).toBe(15);
    expect(resA.duplicatesSkippedCount + resB.duplicatesSkippedCount).toBe(15);

    const storedCount = await prisma.bankTransaction.count({
      where: { connectionId: conn.id },
    });
    expect(storedCount).toBe(15);

    const connAfter = await prisma.bankConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    expect(connAfter.status).toBe('ativa');
    expect(connAfter.lastError).toBeNull();
    expect(connAfter.lastSyncAt).not.toBeNull();
  });

  it('zero log de corpo, segredo, erro bruto da Pluggy ou descrições financeiras nos logs HTTP e assíncronos', async () => {
    const sensitiveSecretMarker = 'webhook_secret_sensitive_token_987654321_long';
    const sensitiveErrorMarker = 'CPF_12345678900_SALDO_R$_98765_BRUTO';
    const sensitiveTxDescription = 'PIX_PRIVADO_FORNECEDOR_SECRETO_42';

    const { conn } = await seedWorkspaceWithConnection({
      itemId: 'item-zero-log',
      status: 'ativa',
    });

    const logChunks: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString('utf8'));
        callback();
      },
    });

    const fakeFail = createFakeAggregator({
      fetchAccountsErrorByItem: {
        'item-zero-log': new Error(`Falha Pluggy sensível: ${sensitiveErrorMarker}`),
      },
    });

    const app = await buildApp({
      env: buildTestEnv({ PLUGGY_WEBHOOK_SECRET: sensitiveSecretMarker }),
      logger: { level: 'info', stream: logStream },
      bankingAggregator: fakeFail.aggregator,
    });
    await app.ready();
    openedApps.push(app);

    // 1. Requisição não autorizada
    await app.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': 'wrong_secret_should_not_leak' },
      payload: { event: 'item/updated', itemId: 'item-zero-log', secretNote: sensitiveTxDescription },
    });

    // 2. Requisição autorizada que falha durante o sync assíncrono no aggregator
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/openfinance/webhook',
      headers: { 'x-webhook-secret': sensitiveSecretMarker },
      payload: {
        event: 'item/updated',
        eventId: 'evt-zero-log-1',
        itemId: 'item-zero-log',
        clientUserId: sensitiveTxDescription,
      },
    });
    expect(validRes.statusCode).toBe(202);

    await closeTrackedApp(app);

    const connAfter = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(connAfter.status).toBe('erro');

    const fullLog = logChunks.join('');
    expect(fullLog.length).toBeGreaterThan(0);
    expect(fullLog).toContain('Falha assíncrona ao processar webhook da Pluggy');
    expect(fullLog).not.toContain(sensitiveSecretMarker);
    expect(fullLog).not.toContain('wrong_secret_should_not_leak');
    expect(fullLog).not.toContain(sensitiveErrorMarker);
    expect(fullLog).not.toContain(sensitiveTxDescription);
    expect(fullLog).not.toContain('item-zero-log');
  });
});
