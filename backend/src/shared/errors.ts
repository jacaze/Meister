export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    code = 'VALIDATION_ERROR'
  ) {
    super(code, message, 400, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Não autenticado', code = 'UNAUTHORIZED') {
    super(code, message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(
    message = 'Acesso negado',
    code = 'FORBIDDEN',
    details?: Record<string, unknown>
  ) {
    super(code, message, 403, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Recurso não encontrado', code = 'NOT_FOUND') {
    super(code, message, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, 409, details);
  }
}

export class RateLimitedError extends DomainError {
  public readonly retryAfterSeconds: number;

  constructor(
    message: string,
    retryAfterSeconds: number,
    code = 'TOO_MANY_ATTEMPTS'
  ) {
    super(code, message, 429, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ExternalServiceError extends DomainError {
  constructor(
    message = 'Serviço externo temporariamente indisponível',
    code = 'EXTERNAL_SERVICE_ERROR'
  ) {
    super(code, message, 503);
  }
}
