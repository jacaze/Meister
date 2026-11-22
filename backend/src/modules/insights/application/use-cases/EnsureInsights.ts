import type { WorkspaceScope } from '../../../../shared/index.js';
import { runDetectors } from './RunDetectors.js';

/** Janela mínima entre duas execuções automáticas para a mesma entidade (leitura de página/Telegram). */
export const INSIGHTS_ON_DEMAND_TTL_MS = 15 * 60 * 1000;
/** Janela do tick interno: na prática uma vez por dia por entidade. */
export const INSIGHTS_TICK_TTL_MS = 20 * 60 * 60 * 1000;

const lastRunAtMs = new Map<string, number>();

export interface RefreshInsightsOptions {
  readonly entityId?: string;
  readonly now?: Date;
  readonly ttlMs?: number;
  readonly run?: typeof runDetectors;
}

/**
 * Garante insights atualizados sem recalcular a cada leitura: roda os detectores por entidade visível
 * (ou só a pedida) no máximo uma vez por janela (`ttlMs`). A deduplicação por `dedupeKey` torna a
 * reexecução idempotente; falhas de uma entidade não derrubam as demais nem a leitura.
 * Retorna quantas entidades foram (re)processadas.
 */
export async function refreshInsightsIfStale(
  scope: WorkspaceScope,
  options: RefreshInsightsOptions = {}
): Promise<number> {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? INSIGHTS_ON_DEMAND_TTL_MS;
  const run = options.run ?? runDetectors;
  const entityIds = options.entityId ? [options.entityId] : [...scope.visibleEntityIds];

  let processed = 0;
  for (const entityId of entityIds) {
    const key = `${scope.workspaceId}:${entityId}`;
    const last = lastRunAtMs.get(key);
    if (last !== undefined && now.getTime() - last < ttlMs) continue;

    lastRunAtMs.set(key, now.getTime());
    try {
      await run(scope, { entityId, referenceDate: now });
      processed += 1;
    } catch (err) {
      lastRunAtMs.delete(key);
      if (options.entityId) throw err;
      console.warn('[refreshInsightsIfStale] falha ao atualizar insights de uma entidade', err instanceof Error ? err.name : 'erro');
    }
  }
  return processed;
}

/** Uso em testes. */
export function resetInsightsRefreshCache(): void {
  lastRunAtMs.clear();
}
