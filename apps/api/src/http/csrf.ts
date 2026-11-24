import type { FastifyInstance } from 'fastify';
import { safeEqual } from '../modules/auth/tokens.js';
import { CSRF_HEADER } from './auth-guard.js';
import { AppError } from './errors.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Double-submit CSRF protection for authenticated mutating requests. The token
 * is an HMAC of the session token, delivered in the readable `qs_csrf` cookie
 * and in GET /auth/me; the client echoes it in the `x-csrf-token` header.
 */
export function registerCsrfHook(app: FastifyInstance): void {
  app.addHook('preHandler', async (request) => {
    if (!MUTATING.has(request.method) || request.routeOptions.config.csrf === false) return;
    if (!request.auth) return; // unauthenticated requests are rejected by the route itself
    const header = request.headers[CSRF_HEADER];
    if (typeof header !== 'string' || !safeEqual(header, request.auth.csrfToken)) {
      throw new AppError(403, 'CSRF_INVALID', 'Missing or invalid CSRF token');
    }
  });
}
