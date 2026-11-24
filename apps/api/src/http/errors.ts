export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'CSRF_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = (message = 'Sign in to continue'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do that'): AppError =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string): AppError => new AppError(409, 'CONFLICT', message);
