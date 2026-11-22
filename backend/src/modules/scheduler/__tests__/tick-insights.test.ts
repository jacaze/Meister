import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/index.js';
import type { TickGateway, WorkspaceTickRecord } from '../application/ports/TickGateway.js';
import type { TickLock } from '../application/ports/TickLock.js';
import { runInternalTick } from '../application/use-cases/RunInternalTick.js';

const lock: TickLock = {
  async withLock(fn) {
    return { acquired: true, value: await fn() };
  },
};

const workspaces: WorkspaceTickRecord[] = ['ws-1', 'ws-2'].map((id) => ({
  id,
  entities: [{ id: `${id}-pf`, kind: 'pf', isMei: false, active: true }],
  bankConnections: [],
}));

function gateway(refresh?: TickGateway['refreshWorkspaceInsights']): TickGateway {
  return {
    async listWorkspacesForTick() {
      return workspaces;
    },
    async syncWorkspaceDas() {
      return { created: 0, alreadyExisted: 0, markedOverdue: 0 };
    },
    async syncPluggyConnection() {},
    refreshWorkspaceInsights: refresh,
  };
}

describe('RunInternalTick — atualização automática de insights', () => {
  it('atualiza insights por workspace e isola falhas', async () => {
    const calls: string[] = [];
    const result = await runInternalTick({
      lock,
      clock: new FakeClock(new Date('2026-11-22T12:00:00Z')),
      timeZone: 'America/Sao_Paulo',
      syncIntervalHours: 12,
      gateway: gateway(async (scope) => {
        calls.push(scope.workspaceId);
        if (scope.workspaceId === 'ws-1') throw new Error('sensível');
        return 1;
      }),
    });
    expect(calls).toEqual(['ws-1', 'ws-2']);
    expect(result.insights).toEqual({ refreshed: 1, errors: 1 });
    expect(result.workspacesProcessed).toBe(2);
  });

  it('sem suporte do gateway, o resultado não ganha o campo insights', async () => {
    const result = await runInternalTick({
      lock,
      clock: new FakeClock(new Date('2026-11-22T12:00:00Z')),
      timeZone: 'America/Sao_Paulo',
      syncIntervalHours: 12,
      gateway: gateway(undefined),
    });
    expect(result.insights).toBeUndefined();
  });
});
