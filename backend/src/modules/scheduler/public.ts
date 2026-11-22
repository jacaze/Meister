export * from './domain/tick-policy.js';
export * from './application/ports/TickLock.js';
export * from './application/ports/TickGateway.js';
export * from './application/use-cases/RunInternalTick.js';
export * from './infra/PostgresAdvisoryTickLock.js';
export * from './infra/PrismaTickGateway.js';

/**
 * Uso restrito à camada de rotas/composição para rotinas de sistema e webhooks
 * autenticados fora do authMiddleware (nunca usar em rotas de usuário final).
 */
export {
  INTERNAL_TICK_ACTOR_ID,
  PLUGGY_WEBHOOK_ACTOR_ID,
  systemScopeFor,
  type SystemJobActorId,
  type WorkspaceEntitySummary,
} from './application/system-scope.js';
