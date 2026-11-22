import { ValidationError, type WorkspaceScope } from '../../../shared/index.js';

export const INTERNAL_TICK_ACTOR_ID = 'system:internal-tick';

export interface WorkspaceEntitySummary {
  readonly id: string;
  readonly kind: string;
  readonly isMei: boolean;
  readonly active: boolean;
}

/**
 * Builds an internal system WorkspaceScope strictly for the scheduled tick routine.
 * Must NOT be exported in scheduler/public.ts.
 */
export function systemScopeFor(
  workspaceId: string,
  entities: ReadonlyArray<WorkspaceEntitySummary>
): WorkspaceScope {
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
    throw new ValidationError('workspaceId é obrigatório para criar o escopo do tick interno.');
  }

  const activeEntities = entities.filter((entity) => entity.active);
  const pf = activeEntities.find((entity) => entity.kind === 'pf')?.id ?? activeEntities[0]?.id ?? '';
  const pj = activeEntities.find((entity) => entity.kind === 'pj')?.id;

  return {
    workspaceId: workspaceId.trim(),
    actorUserId: INTERNAL_TICK_ACTOR_ID,
    role: 'owner',
    defaultEntityIds: pj ? { pf, pj } : { pf },
  };
}
