import { ForbiddenError, UnauthorizedError } from './errors.js';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceScope {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly role: WorkspaceRole;
  readonly defaultEntityIds: {
    readonly pf: string;
    readonly pj?: string;
  };
}

export function assertAuthenticated(userId: string | undefined | null): asserts userId is string {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new UnauthorizedError('Não autenticado');
  }
}

export function assertCanWrite(scope: WorkspaceScope): void {
  if (!scope || !scope.workspaceId || !scope.actorUserId) {
    throw new UnauthorizedError('Não autenticado');
  }
  if (scope.role !== 'owner' && scope.role !== 'editor') {
    throw new ForbiddenError('Apenas membros com permissão de edição podem alterar dados');
  }
}

export function assertOwner(scope: WorkspaceScope): void {
  if (!scope || !scope.workspaceId || !scope.actorUserId) {
    throw new UnauthorizedError('Não autenticado');
  }
  if (scope.role !== 'owner') {
    throw new ForbiddenError('Apenas o proprietário do workspace pode realizar esta ação');
  }
}
