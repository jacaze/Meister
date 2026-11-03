import type { WorkspaceScope } from '../shared/scope.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    correlationId?: string;
    scope?: WorkspaceScope;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub?: string;
      userId?: string;
      id?: string;
      email?: string;
      wid?: string;
    };
    user: {
      sub?: string;
      userId?: string;
      id?: string;
      email?: string;
      wid?: string;
    };
  }
}
