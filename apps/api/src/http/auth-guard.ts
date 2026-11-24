import { hasPermission, type Permission } from '@quillsync/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { findActiveSession, type SessionRecord } from '../modules/auth/session.repository.js';
import { csrfTokenFor, hashSessionToken } from '../modules/auth/tokens.js';
import { forbidden, unauthenticated } from './errors.js';

export const SESSION_COOKIE = 'qs_session';
export const CSRF_COOKIE = 'qs_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const MAX_TOKEN_LENGTH = 128;

export interface AuthContext extends SessionRecord {
  readonly csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** Set to false on routes that establish a session (login/register). */
    csrf?: boolean;
  }
}

/** Resolves the session cookie into `request.auth` for every request (HTTP and WebSocket upgrade). */
export function registerSessionHook(app: FastifyInstance, ctx: AppContext): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token || token.length > MAX_TOKEN_LENGTH) return;
    const record = await findActiveSession(
      ctx.db,
      hashSessionToken(ctx.config.SESSION_SECRET, token),
    );
    if (record)
      request.auth = { ...record, csrfToken: csrfTokenFor(ctx.config.SESSION_SECRET, token) };
  });
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}

export function requirePermission(request: FastifyRequest, permission: Permission): AuthContext {
  const auth = requireAuth(request);
  if (!hasPermission(auth.role, permission)) throw forbidden();
  return auth;
}
