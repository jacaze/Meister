import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  FakeClock,
  LocalDate,
  ValidationError,
} from '../../../shared/index.js';
import {
  isConnectionDueForSync,
  isDasChargeOverdue,
  verifyInternalSecret,
} from '../domain/tick-policy.js';
import {
  INTERNAL_TICK_ACTOR_ID,
  systemScopeFor,
} from '../application/system-scope.js';
import type {
  TickGateway,
  TickLogger,
  WorkspaceTickRecord,
} from '../application/ports/TickGateway.js';
import type { TickLock, TickLockResult } from '../application/ports/TickLock.js';
import { runInternalTick } from '../application/use-cases/RunInternalTick.js';

describe('Scheduler — tick-policy (domínio)', () => {
  describe('verifyInternalSecret', () => {
    it('retorna disabled quando INTERNAL_TICK_SECRET está vazio ou contém apenas espaços', () => {
      expect(verifyInternalSecret('qualquer', '')).toBe('disabled');
      expect(verifyInternalSecret('qualquer', '   \t\n  ')).toBe('disabled');
      expect(verifyInternalSecret(undefined, '')).toBe('disabled');
    });

    it('retorna unauthorized quando header está ausente, vazio ou é array', () => {
      expect(verifyInternalSecret(undefined, 'segredo-forte-32-caracteres-aqui')).toBe('unauthorized');
      expect(verifyInternalSecret('', 'segredo-forte-32-caracteres-aqui')).toBe('unauthorized');
      expect(verifyInternalSecret(['segredo-forte-32-caracteres-aqui'], 'segredo-forte-32-caracteres-aqui')).toBe(
        'unauthorized'
      );
    });

    it('retorna unauthorized para segredo errado de mesmo tamanho ou tamanho distinto', () => {
      const configured = 'segredo-forte-32-caracteres-aqui';
      expect(verifyInternalSecret('x'.repeat(configured.length), configured)).toBe('unauthorized');
      expect(verifyInternalSecret('curto', configured)).toBe('unauthorized');
      expect(verifyInternalSecret(`${configured}extra`, configured)).toBe('unauthorized');
    });

    it('retorna authorized quando header coincide com o segredo configurado (após trim no env)', () => {
      expect(verifyInternalSecret('segredo-valido-123', 'segredo-valido-123')).toBe('authorized');
      expect(verifyInternalSecret('segredo-valido-123', '  segredo-valido-123  ')).toBe('authorized');
      // Header com espaços extras não coincide se env não tiver esses espaços
      expect(verifyInternalSecret(' segredo-valido-123 ', 'segredo-valido-123')).toBe('unauthorized');
    });
  });

  describe('isConnectionDueForSync', () => {
    const now = new Date('2026-11-21T15:00:00.000Z');
    const twelveHoursMs = 12 * 60 * 60 * 1000;

    it('rejeita intervalo inválido (<= 0, NaN, Infinity)', () => {
      const conn = { provider: 'pluggy', itemId: 'item-1', status: 'ativa', lastSyncAt: null };
      expect(() => isConnectionDueForSync(conn, now, 0)).toThrow(ValidationError);
      expect(() => isConnectionDueForSync(conn, now, -1)).toThrow(ValidationError);
      expect(() => isConnectionDueForSync(conn, now, Number.NaN)).toThrow(ValidationError);
      expect(() => isConnectionDueForSync(conn, now, Number.POSITIVE_INFINITY)).toThrow(ValidationError);
    });

    it('ignora conexões que não são pluggy, sem itemId válido ou revogadas', () => {
      expect(
        isConnectionDueForSync(
          { provider: 'ofx', itemId: 'item-1', status: 'ativa', lastSyncAt: null },
          now,
          12
        )
      ).toBe(false);
      expect(
        isConnectionDueForSync(
          { provider: 'csv', itemId: null, status: 'ativa', lastSyncAt: null },
          now,
          12
        )
      ).toBe(false);
      expect(
        isConnectionDueForSync(
          { provider: 'pluggy', itemId: null, status: 'ativa', lastSyncAt: null },
          now,
          12
        )
      ).toBe(false);
      expect(
        isConnectionDueForSync(
          { provider: 'pluggy', itemId: '   ', status: 'ativa', lastSyncAt: null },
          now,
          12
        )
      ).toBe(false);
      expect(
        isConnectionDueForSync(
          { provider: 'pluggy', itemId: 'item-1', status: 'revogada', lastSyncAt: null },
          now,
          12
        )
      ).toBe(false);
      expect(
        isConnectionDueForSync(
          {
            provider: 'pluggy',
            itemId: 'item-1',
            status: 'revogada',
            lastSyncAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
          },
          now,
          12
        )
      ).toBe(false);
    });

    it('retenta conexões Pluggy em status erro mesmo se lastSyncAt for recente', () => {
      expect(
        isConnectionDueForSync(
          {
            provider: 'pluggy',
            itemId: 'item-1',
            status: 'erro',
            lastSyncAt: new Date(now.getTime() - 60_000),
          },
          now,
          12
        )
      ).toBe(true);
    });

    it('respeita lastSyncAt nulo e a fronteira exata do intervalo em horas', () => {
      expect(
        isConnectionDueForSync(
          { provider: 'pluggy', itemId: 'item-1', status: 'ativa', lastSyncAt: null },
          now,
          12
        )
      ).toBe(true);

      // 11h 59m 59.999s atrás -> ainda NÃO vence
      expect(
        isConnectionDueForSync(
          {
            provider: 'pluggy',
            itemId: 'item-1',
            status: 'ativa',
            lastSyncAt: new Date(now.getTime() - (twelveHoursMs - 1)),
          },
          now,
          12
        )
      ).toBe(false);

      // Exatamente 12h atrás -> DEVE sincronizar
      expect(
        isConnectionDueForSync(
          {
            provider: 'pluggy',
            itemId: 'item-1',
            status: 'ativa',
            lastSyncAt: new Date(now.getTime() - twelveHoursMs),
          },
          now,
          12
        )
      ).toBe(true);

      // Mais de 12h atrás -> DEVE sincronizar
      expect(
        isConnectionDueForSync(
          {
            provider: 'pluggy',
            itemId: 'item-1',
            status: 'ativa',
            lastSyncAt: new Date(now.getTime() - twelveHoursMs - 1),
          },
          now,
          12
        )
      ).toBe(true);
    });
  });

  describe('isDasChargeOverdue', () => {
    const today = LocalDate.fromIsoDate('2026-11-21');

    it('retorna true apenas para pendente com dueDate estritamente anterior a today', () => {
      expect(
        isDasChargeOverdue({ status: 'pendente', dueDate: LocalDate.fromIsoDate('2026-11-20') }, today)
      ).toBe(true);
      expect(
        isDasChargeOverdue({ status: 'pendente', dueDate: LocalDate.fromIsoDate('2026-11-21') }, today)
      ).toBe(false);
      expect(
        isDasChargeOverdue({ status: 'pendente', dueDate: LocalDate.fromIsoDate('2026-12-20') }, today)
      ).toBe(false);
      expect(
        isDasChargeOverdue({ status: 'pago', dueDate: LocalDate.fromIsoDate('2026-10-20') }, today)
      ).toBe(false);
      expect(
        isDasChargeOverdue({ status: 'atrasado', dueDate: LocalDate.fromIsoDate('2026-10-20') }, today)
      ).toBe(false);
    });
  });
});

describe('Scheduler — systemScopeFor', () => {
  it('rejeita workspaceId vazio ou apenas espaços', () => {
    expect(() => systemScopeFor('', [])).toThrow(ValidationError);
    expect(() => systemScopeFor('   ', [])).toThrow(ValidationError);
  });

  it('monta escopo owner com ator de sistema e entidades padrão ativas (mesmo se PF não for a primeira)', () => {
    const scope = systemScopeFor('  ws-1  ', [
      { id: 'pj-old', kind: 'pj', isMei: true, active: false },
      { id: 'pj-1', kind: 'pj', isMei: true, active: true },
      { id: 'auto-1', kind: 'autonomo', isMei: false, active: true },
      { id: 'pf-1', kind: 'pf', isMei: false, active: true },
    ]);

    expect(INTERNAL_TICK_ACTOR_ID).toBe('system:internal-tick');
    expect(scope).toEqual({
      workspaceId: 'ws-1',
      actorUserId: 'system:internal-tick',
      role: 'owner',
      defaultEntityIds: { pf: 'pf-1', pj: 'pj-1' },
    });
  });

  it('funciona para workspace sem PJ e faz fallback quando só existe entidade não-PF ativa ou nenhuma', () => {
    const onlyPf = systemScopeFor('ws-pf', [
      { id: 'pf-only', kind: 'pf', isMei: false, active: true },
    ]);
    expect(onlyPf.defaultEntityIds).toEqual({ pf: 'pf-only' });
    expect('pj' in onlyPf.defaultEntityIds).toBe(false);

    const onlyPj = systemScopeFor('ws-pj', [
      { id: 'pj-only', kind: 'pj', isMei: true, active: true },
    ]);
    expect(onlyPj.defaultEntityIds).toEqual({ pf: 'pj-only', pj: 'pj-only' });

    const empty = systemScopeFor('ws-empty', [
      { id: 'pf-inactive', kind: 'pf', isMei: false, active: false },
    ]);
    expect(empty.defaultEntityIds).toEqual({ pf: '' });
  });
});

describe('Scheduler — runInternalTick (orquestração)', () => {
  it('lança ConflictError 409 TICK_ALREADY_RUNNING quando lock não é adquirido', async () => {
    const busyLock: TickLock = {
      async withLock<T>(): Promise<TickLockResult<T>> {
        return { acquired: false };
      },
    };
    let listed = false;
    const gateway: TickGateway = {
      async listWorkspacesForTick() {
        listed = true;
        return [];
      },
      async syncWorkspaceDas() {
        return { created: 0, alreadyExisted: 0, markedOverdue: 0 };
      },
      async syncPluggyConnection() {},
    };

    await expect(
      runInternalTick({
        lock: busyLock,
        gateway,
        clock: new FakeClock('2026-11-21T15:00:00.000Z'),
        timeZone: 'America/Sao_Paulo',
        syncIntervalHours: 12,
      })
    ).rejects.toMatchObject({
      code: 'TICK_ALREADY_RUNNING',
      statusCode: 409,
    });
    expect(listed).toBe(false);

    try {
      await runInternalTick({
        lock: busyLock,
        gateway,
        clock: new FakeClock(),
        timeZone: 'America/Sao_Paulo',
        syncIntervalHours: 12,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });

  it('soma métricas, isola falhas por workspace e conexão e nunca loga mensagens/dados sensíveis', async () => {
    const clock = new FakeClock('2026-11-21T15:00:00.000Z');
    const dueTime = new Date(clock.now().getTime() - 13 * 60 * 60 * 1000);
    const freshTime = new Date(clock.now().getTime() - 2 * 60 * 60 * 1000);

    const workspaces: WorkspaceTickRecord[] = [
      {
        id: 'ws-a',
        entities: [
          { id: 'pf-a', kind: 'pf', isMei: false, active: true },
          { id: 'pj-a', kind: 'pj', isMei: true, active: true },
        ],
        bankConnections: [
          { id: 'conn-a-fail', provider: 'pluggy', itemId: 'i1', status: 'ativa', lastSyncAt: dueTime },
          { id: 'conn-a-ok', provider: 'pluggy', itemId: 'i2', status: 'ativa', lastSyncAt: dueTime },
          { id: 'conn-a-skip', provider: 'pluggy', itemId: 'i3', status: 'ativa', lastSyncAt: freshTime },
        ],
      },
      {
        id: 'ws-b',
        entities: [{ id: 'pf-b', kind: 'pf', isMei: false, active: true }],
        bankConnections: [
          { id: 'conn-b-err', provider: 'pluggy', itemId: 'i4', status: 'erro', lastSyncAt: freshTime },
          { id: 'conn-b-unknown', provider: 'pluggy', itemId: 'i5', status: 'ativa', lastSyncAt: null },
        ],
      },
    ];

    const logEntries: Array<{ level: string; meta: Record<string, unknown>; msg: string }> = [];
    const logger: TickLogger = {
      info: (meta, msg) => logEntries.push({ level: 'info', meta, msg }),
      warn: (meta, msg) => logEntries.push({ level: 'warn', meta, msg }),
      error: (meta, msg) => logEntries.push({ level: 'error', meta, msg }),
    };

    const syncedConnections: string[] = [];
    const lock: TickLock = {
      async withLock<T>(fn: () => Promise<T>): Promise<TickLockResult<T>> {
        return { acquired: true, value: await fn() };
      },
    };

    const sensitiveLeak = 'CPF 123.456.789-00 saldo R$ 99999.00 token secret_xyz';

    const gateway: TickGateway = {
      async listWorkspacesForTick() {
        return workspaces;
      },
      async syncWorkspaceDas(scope, passedClock, tz) {
        expect(passedClock).toBe(clock);
        expect(tz).toBe('America/Sao_Paulo');
        if (scope.workspaceId === 'ws-a') {
          throw new ValidationError(`Falha sensível ${sensitiveLeak}`, undefined, 'DAS_CALC_FAILED');
        }
        return { created: 2, alreadyExisted: 5, markedOverdue: 1 };
      },
      async syncPluggyConnection(_scope, connectionId) {
        if (connectionId === 'conn-a-fail') {
          const blankNameErr = new Error(sensitiveLeak);
          blankNameErr.name = '   ';
          throw blankNameErr;
        }
        if (connectionId === 'conn-b-unknown') {
          throw sensitiveLeak;
        }
        syncedConnections.push(connectionId);
      },
    };

    const result = await runInternalTick({
      lock,
      gateway,
      clock,
      timeZone: 'America/Sao_Paulo',
      syncIntervalHours: 12,
      logger,
    });

    expect(result).toEqual({
      executedAt: '2026-11-21T15:00:00.000Z',
      workspacesProcessed: 2,
      das: {
        created: 2,
        alreadyExisted: 5,
        markedOverdue: 1,
        errors: 1,
      },
      openfinance: {
        synced: 2,
        skipped: 1,
        errors: 2,
      },
    });
    expect(syncedConnections).toEqual(['conn-a-ok', 'conn-b-err']);

    const errorLogs = logEntries.filter((e) => e.level === 'error');
    expect(errorLogs).toEqual([
      {
        level: 'error',
        meta: { workspaceId: 'ws-a', errorCode: 'DAS_CALC_FAILED' },
        msg: 'Falha ao sincronizar DAS no tick interno',
      },
      {
        level: 'error',
        meta: { workspaceId: 'ws-a', connectionId: 'conn-a-fail', errorCode: 'UNKNOWN_ERROR' },
        msg: 'Falha ao sincronizar conexão Open Finance no tick interno',
      },
      {
        level: 'error',
        meta: { workspaceId: 'ws-b', connectionId: 'conn-b-unknown', errorCode: 'UNKNOWN_ERROR' },
        msg: 'Falha ao sincronizar conexão Open Finance no tick interno',
      },
    ]);

    const infoLogs = logEntries.filter((e) => e.level === 'info');
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]?.meta).toEqual(result);

    // Garantia estrita de que nenhum dado financeiro/CPF/token vazou em qualquer log
    expect(JSON.stringify(logEntries)).not.toContain(sensitiveLeak);
    expect(JSON.stringify(logEntries)).not.toContain('123.456.789-00');
  });

  it('também lida com Error nomeado padrão e execução sem logger opcional', async () => {
    const lock: TickLock = {
      async withLock<T>(fn: () => Promise<T>): Promise<TickLockResult<T>> {
        return { acquired: true, value: await fn() };
      },
    };
    const logs: Array<Record<string, unknown>> = [];
    const logger: TickLogger = {
      info: () => {},
      warn: () => {},
      error: (meta) => logs.push(meta),
    };

    const gatewayWithNamedError: TickGateway = {
      async listWorkspacesForTick() {
        return [
          {
            id: 'ws-1',
            entities: [{ id: 'pf-1', kind: 'pf', isMei: false, active: true }],
            bankConnections: [
              { id: 'c1', provider: 'pluggy', itemId: 'i1', status: 'ativa', lastSyncAt: null },
            ],
          },
        ];
      },
      async syncWorkspaceDas() {
        return { created: 1, alreadyExisted: 0, markedOverdue: 0 };
      },
      async syncPluggyConnection() {
        throw new TypeError('secret body');
      },
    };

    const res1 = await runInternalTick({
      lock,
      gateway: gatewayWithNamedError,
      clock: new FakeClock('2026-11-21T15:00:00.000Z'),
      timeZone: 'America/Sao_Paulo',
      syncIntervalHours: 12,
      logger,
    });
    expect(res1.openfinance.errors).toBe(1);
    expect(logs).toEqual([{ workspaceId: 'ws-1', connectionId: 'c1', errorCode: 'TypeError' }]);

    // Sem logger não lança exceção em falhas de DAS nem OpenFinance
    const gatewayNoLoggerFail: TickGateway = {
      ...gatewayWithNamedError,
      async syncWorkspaceDas() {
        throw new Error('boom');
      },
    };
    const res2 = await runInternalTick({
      lock,
      gateway: gatewayNoLoggerFail,
      clock: new FakeClock('2026-11-21T15:00:00.000Z'),
      timeZone: 'America/Sao_Paulo',
      syncIntervalHours: 12,
    });
    expect(res2.das.errors).toBe(1);
    expect(res2.openfinance.errors).toBe(1);
  });
});
