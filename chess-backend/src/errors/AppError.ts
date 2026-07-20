/**
 * Centralized application error hierarchy.
 *
 * All thrown errors in controllers/services should be instances of AppError
 * (or a subclass). The error middleware in errorMiddleware.ts will catch them
 * and format a consistent JSON response.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Record<string, string>[];

  constructor(
    message: string,
    statusCode: number,
    errors?: Record<string, string>[],
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — Request body / params / query failed validation */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", errors?: Record<string, string>[]) {
    super(message, 400, errors);
  }
}

/** 401 — Missing or invalid credentials / token */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

/** 403 — Authenticated but lacks permission */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403);
  }
}

/** 404 — Resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404);
  }
}

/** 409 — Duplicate / conflicting resource */
export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409);
  }
}

/** 500 — Unexpected server error (non-operational) */
export class InternalServerError extends AppError {
  constructor(message = "An unexpected error occurred") {
    super(message, 500, undefined, false);
  }
}
