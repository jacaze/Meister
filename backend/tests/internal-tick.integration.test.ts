import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { FakeClock, LocalDate, parseEnv } from '../src/shared/index.js';
import type {
  BankingAggregator,
  PluggyAccountInfo,
  PluggyItemInfo,
  PluggyTransactionInfo,
} from '../src/modules/openfinance/public.js';

const VALID_SECRET = 'internal_tick_secret_valid_test_value_123456';
const LOCK_KEY_1 = 1835362675;
const LOCK_KEY_2 = 1953063787;

interface FakeAggregatorScript {
  syncItemErrorByItem?: Record<string, Error>;
  fetchAccountsErrorByItem?: Record<string, Error>;
  delayFetchAccountsMsByItem?: Record<string, number>;
  accountsByItem?: Record<string, PluggyAccountInfo[]>;
  transactionsByAccount?: Record<string, PluggyTransactionInfo[]>;
}

function createFakeAggregator(script: FakeAggregatorScript = {}) {
  const syncItemCalls: string[] = [];
  const fetchAccountsCalls: string[] = [];

  const aggregator: BankingAggregator = {
    async validateCredentials() {
      return { valid: true };
    },
    async createConnectToken() {
      return 'fake-connect-token';
    },
    async fetchItem(itemId: string): Promise<PluggyItemInfo> {
      return {
        id: itemId,
        status: 'UPDATED',
        connector: { id: 1, name: `Banco ${itemId}` },
        createdAt: '2026-11-01T00:00:00.000Z',
      };
    },
    async syncItem(itemId: string) {
      syncItemCalls.push(itemId);
      const err = script.syncItemErrorByItem?.[itemId];
      if (err) {
        throw err;
      }
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
      return (
        script.transactionsByAccount?.[accountId] ?? [
          {
            id: `ext-tx-${accountId}-1`,
            description: 'Recebimento PIX Cliente',
            amount: 250.0,
            date: '2026-11-15',
            type: 'CREDIT',
          },
        ]
      );
    },
  };

  return { aggregator, syncItemCalls, fetchAccountsCalls };
}

function buildTestEnv(overrides: Record<string, string | undefined> = {}) {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'test',
    DEFAULT_TIMEZONE: 'America/Sao_Paulo',
    INTERNAL_TICK_SECRET: VALID_SECRET,
    OPENFINANCE_SYNC_INTERVAL_HOURS: '12',
    ...overrides,
  };
  return parseEnv(merged);
}

describe('Rotina interna /api/internal/tick (Tarefa 08)', () => {
  const openedApps: FastifyInstance[] = [];

  async function openTestApp(options: {
    secret?: string;
    syncIntervalHours?: number;
    clock?: FakeClock;
    bankingAggregator?: BankingAggregator;
  } = {}): Promise<FastifyInstance> {
    const app = await buildApp({
      env: buildTestEnv({
        INTERNAL_TICK_SECRET: options.secret ?? VALID_SECRET,
        ...(options.syncIntervalHours !== undefined
          ? { OPENFINANCE_SYNC_INTERVAL_HOURS: String(options.syncIntervalHours) }
          : {}),
      }),
      logger: false,
      clock: options.clock,
      bankingAggregator: options.bankingAggregator,
    });
    await app.ready();
    openedApps.push(app);
    return app;
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

  it('autenticação: sem segredo retorna 404; sem header ou header errado retorna 401; segredo válido funciona independente de IP e sem auth de usuário', async () => {
    const disabledAppEmpty = await openTestApp({ secret: '' });
    const resEmpty = await disabledAppEmpty.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(resEmpty.statusCode).toBe(404);
    expect(resEmpty.json().code).toBe('INTERNAL_TICK_DISABLED');

    const disabledAppSpaces = await openTestApp({ secret: '   ' });
    const resSpaces = await disabledAppSpaces.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(resSpaces.statusCode).toBe(404);
    expect(resSpaces.json().code).toBe('INTERNAL_TICK_DISABLED');

    const app = await openTestApp();

    const resMissing = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
    });
    expect(resMissing.statusCode).toBe(401);
    expect(resMissing.json().code).toBe('INVALID_INTERNAL_SECRET');

    const resWrongSameLen = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': 'x'.repeat(VALID_SECRET.length) },
    });
    expect(resWrongSameLen.statusCode).toBe(401);
    expect(resWrongSameLen.json().code).toBe('INVALID_INTERNAL_SECRET');

    const resWrongDiffLen = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': 'curto' },
    });
    expect(resWrongDiffLen.statusCode).toBe(401);

    // Sem Bearer token e simulando X-Forwarded-For externo: deve autorizar apenas pelo X-Internal-Secret
    const resValid = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: {
        'x-internal-secret': VALID_SECRET,
        'x-forwarded-for': '203.0.113.50',
      },
    });
    expect(resValid.statusCode).toBe(200);
    expect(resValid.json()).toMatchObject({
      workspacesProcessed: 0,
      das: { created: 0, alreadyExisted: 0, markedOverdue: 0, errors: 0 },
      openfinance: { synced: 0, skipped: 0, errors: 0 },
    });
  });

  it('DAS: gera idempotentemente para todos os MEIs ativos do workspace e ignora PF, autônomo e MEI inativo', async () => {
    const clock = new FakeClock('2026-11-15T15:00:00.000Z');
    const ws = await prisma.workspace.create({
      data: { name: 'Workspace Multi MEI', profile: 'familia_negocio' },
    });

    const pf = await prisma.entity.create({
      data: { workspaceId: ws.id, kind: 'pf', name: 'PF Titular', isMei: false, active: true },
    });
    const mei1 = await prisma.entity.create({
      data: {
        workspaceId: ws.id,
        kind: 'pj',
        name: 'MEI Serviços',
        isMei: true,
        activity: 'servicos',
        openedOn: new Date('2026-01-01T00:00:00.000Z'),
        active: true,
      },
    });
    const mei2 = await prisma.entity.create({
      data: {
        workspaceId: ws.id,
        kind: 'pj',
        name: 'MEI Comércio',
        isMei: true,
        activity: 'comercio',
        openedOn: new Date('2026-10-01T00:00:00.000Z'),
        active: true,
      },
    });
    const autonomo = await prisma.entity.create({
      data: {
        workspaceId: ws.id,
        kind: 'autonomo',
        name: 'Autônomo Design',
        isMei: false,
        active: true,
      },
    });
    const meiInativo = await prisma.entity.create({
      data: {
        workspaceId: ws.id,
        kind: 'pj',
        name: 'MEI Arquivado',
        isMei: true,
        activity: 'servicos',
        openedOn: new Date('2026-01-01T00:00:00.000Z'),
        active: false,
      },
    });

    const app = await openTestApp({ clock });

    const first = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      executedAt: '2026-11-15T15:00:00.000Z',
      workspacesProcessed: 1,
      das: { created: 13, alreadyExisted: 0, markedOverdue: 9, errors: 0 },
    });

    expect(await prisma.dasCharge.count({ where: { entityId: mei1.id } })).toBe(11);
    expect(await prisma.dasCharge.count({ where: { entityId: mei2.id } })).toBe(2);
    expect(await prisma.dasCharge.count({ where: { workspaceId: ws.id, status: 'atrasado' } })).toBe(9);
    expect(await prisma.dasCharge.count({ where: { workspaceId: ws.id, status: 'pendente' } })).toBe(4);
    expect(await prisma.dasCharge.count({ where: { entityId: pf.id } })).toBe(0);
    expect(await prisma.dasCharge.count({ where: { entityId: autonomo.id } })).toBe(0);
    expect(await prisma.dasCharge.count({ where: { entityId: meiInativo.id } })).toBe(0);

    // Segunda execução no mesmo mês: estritamente idempotente
    const second = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      workspacesProcessed: 1,
      das: { created: 0, alreadyExisted: 13, markedOverdue: 0, errors: 0 },
    });
    expect(await prisma.dasCharge.count({ where: { workspaceId: ws.id } })).toBe(13);
  });

  it('DAS: marca guias pendentes vencidas como atrasado respeitando America/Sao_Paulo via Clock', async () => {
    // 2026-11-21T01:30:00.000Z = 2026-11-20 22:30 BRT (ainda dia 20/11 no Brasil!)
    const clock = new FakeClock('2026-11-21T01:30:00.000Z');
    const ws = await prisma.workspace.create({ data: { name: 'Workspace Atraso' } });
    const mei = await prisma.entity.create({
      data: {
        workspaceId: ws.id,
        kind: 'pj',
        name: 'MEI Pontual',
        isMei: true,
        activity: 'servicos',
        openedOn: new Date('2026-09-01T00:00:00.000Z'),
        active: true,
      },
    });

    const paidSep = await prisma.dasCharge.create({
      data: {
        workspaceId: ws.id,
        entityId: mei.id,
        competence: '2026-09',
        dueDate: LocalDate.fromIsoDate('2026-10-20').toUtcDate(),
        amount: 86.05,
        status: 'pago',
        paidOn: LocalDate.fromIsoDate('2026-10-18').toUtcDate(),
        paidAmount: 86.05,
      },
    });
    const dueTodayOct = await prisma.dasCharge.create({
      data: {
        workspaceId: ws.id,
        entityId: mei.id,
        competence: '2026-10',
        dueDate: LocalDate.fromIsoDate('2026-11-20').toUtcDate(),
        amount: 86.05,
        status: 'pendente',
      },
    });
    const futureNov = await prisma.dasCharge.create({
      data: {
        workspaceId: ws.id,
        entityId: mei.id,
        competence: '2026-11',
        dueDate: LocalDate.fromIsoDate('2026-12-21').toUtcDate(),
        amount: 86.05,
        status: 'pendente',
      },
    });

    const app = await openTestApp({ clock });

    // Antes da meia-noite em São Paulo, dia 20 ainda não venceu
    const beforeMidnightBrt = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(beforeMidnightBrt.statusCode).toBe(200);
    expect(beforeMidnightBrt.json().das).toMatchObject({
      created: 0,
      alreadyExisted: 3,
      markedOverdue: 0,
      errors: 0,
    });
    expect((await prisma.dasCharge.findUniqueOrThrow({ where: { id: dueTodayOct.id } })).status).toBe('pendente');

    // Avança para 2026-11-21T03:05:00.000Z = 2026-11-21 00:05 BRT (dia 20 venceu!)
    clock.setNow('2026-11-21T03:05:00.000Z');
    const afterMidnightBrt = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(afterMidnightBrt.statusCode).toBe(200);
    expect(afterMidnightBrt.json().das).toMatchObject({
      markedOverdue: 1,
      errors: 0,
    });

    expect((await prisma.dasCharge.findUniqueOrThrow({ where: { id: dueTodayOct.id } })).status).toBe('atrasado');
    expect((await prisma.dasCharge.findUniqueOrThrow({ where: { id: paidSep.id } })).status).toBe('pago');
    expect((await prisma.dasCharge.findUniqueOrThrow({ where: { id: futureNov.id } })).status).toBe('pendente');

    // Rodar de novo mantém contagem idempotente
    const repeat = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });
    expect(repeat.json().das.markedOverdue).toBe(0);
  });

  it('Open Finance: sincroniza por lastSyncAt (>= 12h), retenta conexões em erro, ignora recentes/revogadas e importa contas com entityId nulo', async () => {
    const clock = new FakeClock('2026-11-21T15:00:00.000Z');
    const ws = await prisma.workspace.create({ data: { name: 'Workspace OF', profile: 'negocio' } });
    await prisma.entity.create({
      data: { workspaceId: ws.id, kind: 'pf', name: 'PF', isMei: false, active: true },
    });
    await prisma.entity.create({
      data: { workspaceId: ws.id, kind: 'pj', name: 'PJ', isMei: true, active: true },
    });

    const thirteenHoursAgo = new Date(clock.now().getTime() - 13 * 60 * 60 * 1000);
    const oneHourAgo = new Date(clock.now().getTime() - 1 * 60 * 60 * 1000);

    const connDue = await prisma.bankConnection.create({
      data: {
        workspaceId: ws.id,
        provider: 'pluggy',
        itemId: 'item-due-13h',
        institution: 'Banco Antigo',
        status: 'ativa',
        lastSyncAt: thirteenHoursAgo,
      },
    });
    // Conta pré-existente sem entidade atribuída (Tarefa 14): deve importar normalmente
    const accNullEntity = await prisma.bankAccount.create({
      data: {
        connectionId: connDue.id,
        externalId: 'acc-due-null',
        kind: 'conta_corrente',
        name: 'Conta Sem Entidade',
        entityId: null,
      },
    });

    const connRecent = await prisma.bankConnection.create({
      data: {
        workspaceId: ws.id,
        provider: 'pluggy',
        itemId: 'item-recent-1h',
        institution: 'Banco Recente',
        status: 'ativa',
        lastSyncAt: oneHourAgo,
      },
    });

    const connError = await prisma.bankConnection.create({
      data: {
        workspaceId: ws.id,
        provider: 'pluggy',
        itemId: 'item-erro-retry',
        institution: 'Banco Erro',
        status: 'erro',
        lastSyncAt: oneHourAgo,
        lastError: 'Falha temporária anterior',
      },
    });

    await prisma.bankConnection.create({
      data: {
        workspaceId: ws.id,
        provider: 'pluggy',
        itemId: 'item-revogada',
        institution: 'Banco Revogado',
        status: 'revogada',
        lastSyncAt: null,
      },
    });

    const fake = createFakeAggregator({
      accountsByItem: {
        'item-due-13h': [
          { id: 'acc-due-null', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta Sem Entidade' },
        ],
        'item-erro-retry': [
          { id: 'acc-retry-new', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta Recuperada' },
        ],
      },
    });

    const app = await openTestApp({
      clock,
      syncIntervalHours: 12,
      bankingAggregator: fake.aggregator,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().openfinance).toEqual({
      synced: 2,
      skipped: 2,
      errors: 0,
    });
    expect(fake.syncItemCalls.sort()).toEqual(['item-due-13h', 'item-erro-retry']);
    expect(fake.syncItemCalls).not.toContain('item-recent-1h');
    expect(fake.syncItemCalls).not.toContain('item-revogada');

    // Conta com entityId nulo recebeu transações importadas e continuou com entityId null
    const importedNullAccTxs = await prisma.bankTransaction.count({
      where: { connectionId: connDue.id, bankAccountId: accNullEntity.id },
    });
    expect(importedNullAccTxs).toBe(1);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: accNullEntity.id } })).entityId).toBeNull();

    // Conexão recente permaneceu intacta
    const freshRecent = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connRecent.id } });
    expect(freshRecent.lastSyncAt?.toISOString()).toBe(oneHourAgo.toISOString());

    // Conexão que estava em erro recuperou para ativa e limpou lastError
    const recovered = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connError.id } });
    expect(recovered.status).toBe('ativa');
    expect(recovered.lastError).toBeNull();
    expect(recovered.lastSyncAt).not.toBeNull();
  });

  it('Open Finance: se syncItem lançar Forbidden, syncPluggyConnection trata como aviso e o tick conta como sincronizada', async () => {
    const clock = new FakeClock('2026-11-21T15:00:00.000Z');
    const ws = await prisma.workspace.create({ data: { name: 'Workspace Forbidden SyncItem' } });
    await prisma.entity.create({
      data: { workspaceId: ws.id, kind: 'pf', name: 'PF', isMei: false, active: true },
    });
    const conn = await prisma.bankConnection.create({
      data: {
        workspaceId: ws.id,
        provider: 'pluggy',
        itemId: 'item-forbidden-sync',
        institution: 'MeuPluggy',
        status: 'ativa',
        lastSyncAt: new Date(clock.now().getTime() - 13 * 60 * 60 * 1000),
      },
    });

    const fake = createFakeAggregator({
      syncItemErrorByItem: {
        'item-forbidden-sync': new Error('Pluggy HTTP 403 Forbidden'),
      },
    });

    const app = await openTestApp({
      clock,
      bankingAggregator: fake.aggregator,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().openfinance).toEqual({
      synced: 1,
      skipped: 0,
      errors: 0,
    });

    const updatedConn = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(updatedConn.status).toBe('ativa');
    expect(updatedConn.lastError).toBeNull();
    expect(await prisma.bankTransaction.count({ where: { connectionId: conn.id } })).toBe(1);
  });

  it('isolamento entre workspaces: erro em um workspace não impede os demais de sincronizar', async () => {
    const clock = new FakeClock('2026-11-21T15:00:00.000Z');
    const fifteenHoursAgo = new Date(clock.now().getTime() - 15 * 60 * 60 * 1000);

    const wsA = await prisma.workspace.create({ data: { name: 'Workspace A Falha' } });
    await prisma.entity.create({
      data: { workspaceId: wsA.id, kind: 'pf', name: 'PF A', isMei: false, active: true },
    });
    const connA = await prisma.bankConnection.create({
      data: {
        workspaceId: wsA.id,
        provider: 'pluggy',
        itemId: 'item-fail',
        institution: 'Banco Instável',
        status: 'ativa',
        lastSyncAt: fifteenHoursAgo,
      },
    });

    const wsB = await prisma.workspace.create({ data: { name: 'Workspace B OK' } });
    await prisma.entity.create({
      data: { workspaceId: wsB.id, kind: 'pf', name: 'PF B', isMei: false, active: true },
    });
    const connB = await prisma.bankConnection.create({
      data: {
        workspaceId: wsB.id,
        provider: 'pluggy',
        itemId: 'item-ok',
        institution: 'Banco Estável',
        status: 'ativa',
        lastSyncAt: fifteenHoursAgo,
      },
    });

    const fake = createFakeAggregator({
      fetchAccountsErrorByItem: {
        'item-fail': new Error('Timeout upstream Pluggy'),
      },
    });

    const app = await openTestApp({
      clock,
      bankingAggregator: fake.aggregator,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/tick',
      headers: { 'x-internal-secret': VALID_SECRET },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      workspacesProcessed: 2,
      openfinance: { synced: 1, skipped: 0, errors: 1 },
    });

    const freshA = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connA.id } });
    expect(freshA.status).toBe('erro');

    const freshB = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connB.id } });
    expect(freshB.status).toBe('ativa');
    expect(await prisma.bankTransaction.count({ where: { connectionId: connB.id } })).toBe(1);
  });

  it(
    'lock transacional: execução > 5s não aborta, mantém advisory lock no Postgres e retorna 409 para chamadas simultâneas',
    async () => {
      const clock = new FakeClock('2026-11-21T15:00:00.000Z');
      const ws = await prisma.workspace.create({ data: { name: 'Workspace Slow Lock' } });
      await prisma.entity.create({
        data: { workspaceId: ws.id, kind: 'pf', name: 'PF Slow', isMei: false, active: true },
      });
      await prisma.bankConnection.create({
        data: {
          workspaceId: ws.id,
          provider: 'pluggy',
          itemId: 'item-slow',
          institution: 'Banco Lento',
          status: 'ativa',
          lastSyncAt: null,
        },
      });

      const fake = createFakeAggregator({
        delayFetchAccountsMsByItem: {
          'item-slow': 5600,
        },
      });

      const app1 = await openTestApp({ clock, bankingAggregator: fake.aggregator });
      const app2 = await openTestApp({ clock, bankingAggregator: fake.aggregator });

      const firstPromise = app1.inject({
        method: 'POST',
        url: '/api/internal/tick',
        headers: { 'x-internal-secret': VALID_SECRET },
      });

      // Aguarda passar o timeout padrão de 5s do Prisma enquanto fetchAccounts ainda está executando
      await new Promise((resolve) => setTimeout(resolve, 5200));

      // Prova no Postgres real que o advisory lock ainda está preso (> 5s sem abortar a transação)
      const probeHeld = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY_1}::int4, ${LOCK_KEY_2}::int4) AS acquired
      `;
      expect(probeHeld[0]?.acquired).toBe(false);

      // Chamada concorrente na mesma instância e em segunda instância retorna 409
      const [concurrentSameApp, concurrentOtherApp] = await Promise.all([
        app1.inject({
          method: 'POST',
          url: '/api/internal/tick',
          headers: { 'x-internal-secret': VALID_SECRET },
        }),
        app2.inject({
          method: 'POST',
          url: '/api/internal/tick',
          headers: { 'x-internal-secret': VALID_SECRET },
        }),
      ]);

      expect(concurrentSameApp.statusCode).toBe(409);
      expect(concurrentSameApp.json().code).toBe('TICK_ALREADY_RUNNING');
      expect(concurrentOtherApp.statusCode).toBe(409);
      expect(concurrentOtherApp.json().code).toBe('TICK_ALREADY_RUNNING');

      const firstRes = await firstPromise;
      expect(firstRes.statusCode).toBe(200);
      expect(firstRes.json().openfinance).toEqual({
        synced: 1,
        skipped: 0,
        errors: 0,
      });

      // Após o término, o lock foi liberado no Postgres
      const probeReleased = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY_1}::int4, ${LOCK_KEY_2}::int4) AS acquired
      `;
      expect(probeReleased[0]?.acquired).toBe(true);
    },
    25_000
  );
});
