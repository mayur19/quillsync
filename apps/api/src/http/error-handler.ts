import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { fail } from './envelope.js';
import { AppError } from './errors.js';

function fromFastifyError(error: FastifyError): AppError | null {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (
    error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
    error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY'
  ) {
    return new AppError(400, 'VALIDATION_ERROR', error.message);
  }
  if (error.statusCode === 400) return new AppError(400, 'VALIDATION_ERROR', 'Malformed request');
  return null;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send(
        fail({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        }),
      );
    }
    const appError = error instanceof AppError ? error : fromFastifyError(error);
    if (appError) {
      if (appError.statusCode === 429 && appError.details?.retryAfterSeconds) {
        void reply.header('retry-after', String(appError.details.retryAfterSeconds));
      }
      return reply.status(appError.statusCode).send(
        fail({
          code: appError.code,
          message: appError.message,
          ...(appError.details ? { details: appError.details } : {}),
        }),
      );
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(fail({ code: 'INTERNAL', message: 'Something went wrong' }));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(
      fail({
        code: 'NOT_FOUND',
        message: `No route for ${request.method} ${request.url.split('?')[0]}`,
      }),
    ),
  );
}
