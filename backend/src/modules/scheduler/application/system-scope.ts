import { ValidationError, type WorkspaceScope } from '../../../shared/index.js';

export const INTERNAL_TICK_ACTOR_ID = 'system:internal-tick' as const;
export const PLUGGY_WEBHOOK_ACTOR_ID = 'system:pluggy-webhook' as const;
export type SystemJobActorId = typeof INTERNAL_TICK_ACTOR_ID | typeof PLUGGY_WEBHOOK_ACTOR_ID;

export interface WorkspaceEntitySummary {
  readonly id: string;
  readonly kind: string;
  readonly isMei: boolean;
  readonly active: boolean;
}

/**
 * Builds an internal system WorkspaceScope strictly for background system jobs
 * (scheduled tick or authenticated webhook adapters outside authMiddleware).
 */
export function systemScopeFor(
  workspaceId: string,
  entities: ReadonlyArray<WorkspaceEntitySummary>,
  actorUserId: SystemJobActorId = INTERNAL_TICK_ACTOR_ID
): WorkspaceScope {
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
    throw new ValidationError('workspaceId é obrigatório para criar o escopo do tick interno.');
  }

  if (actorUserId !== INTERNAL_TICK_ACTOR_ID && actorUserId !== PLUGGY_WEBHOOK_ACTOR_ID) {
    throw new ValidationError('actorUserId de sistema inválido.');
  }

  const activeEntities = entities.filter((entity) => entity.active);
  const pf = activeEntities.find((entity) => entity.kind === 'pf')?.id ?? activeEntities[0]?.id ?? '';
  const pj = activeEntities.find((entity) => entity.kind === 'pj')?.id;

  return {
    workspaceId: workspaceId.trim(),
    actorUserId,
    role: 'owner',
    defaultEntityIds: pj ? { pf, pj } : { pf },
    // Rotina de sistema enxerga todas as entidades ativas e não é dona de nenhuma
    visibleEntityIds: activeEntities.map((entity) => entity.id),
    ownEntityIds: [],
  };
}
