import { loginSchema, registerSchema } from '@quillsync/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../context.js';
import { CSRF_COOKIE, requireAuth, SESSION_COOKIE } from '../../http/auth-guard.js';
import { ok } from '../../http/envelope.js';
import { AppError } from '../../http/errors.js';
import { normalizeIp } from '../../http/rate-limit.js';
import { recordAudit } from '../audit/audit.repository.js';
import {
  login,
  mePayload,
  REGISTRATION_ACCEPTED_MESSAGE,
  registerOwner,
  type IssuedSession,
  type RequestMeta,
} from './auth.service.js';
import { deleteSession, findActiveSession } from './session.repository.js';
import { hashSessionToken } from './tokens.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const THROTTLED = 'Too many attempts; try again later';

function throttle(result: { allowed: boolean; retryAfterSeconds: number }): void {
  if (!result.allowed) {
    throw new AppError(429, 'RATE_LIMITED', THROTTLED, {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

function requestMeta(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    requestId: request.id,
  };
}

function setSessionCookies(ctx: AppContext, reply: FastifyReply, session: IssuedSession): void {
  const secure = ctx.config.NODE_ENV === 'production';
  const maxAge = ctx.config.SESSION_TTL_HOURS * 3600;
  void reply.setCookie(SESSION_COOKIE, session.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge,
  });
  void reply.setCookie(CSRF_COOKIE, session.csrfToken, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge,
  });
}

async function sessionPayload(ctx: AppContext, session: IssuedSession) {
  const record = await findActiveSession(
    ctx.db,
    hashSessionToken(ctx.config.SESSION_SECRET, session.token),
  );
  if (!record) throw new AppError(500, 'INTERNAL', 'Session could not be established');
  return mePayload(record, session.csrfToken);
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/v1/auth/register', { config: { csrf: false } }, async (request, reply) => {
    throttle(ctx.limiters.registerByIp.hit(normalizeIp(request.ip)));
    const input = registerSchema.parse(request.body);
    await registerOwner(ctx, input, requestMeta(request));
    // Same status and body whether or not the email already existed (no enumeration).
    return reply
      .status(202)
      .send(ok({ status: 'accepted', message: REGISTRATION_ACCEPTED_MESSAGE }));
  });

  app.post('/api/v1/auth/login', { config: { csrf: false } }, async (request, reply) => {
    // Every limiter reserves the attempt synchronously, before the first await,
    // so parallel requests cannot all pass the checks.
    const ip = normalizeIp(request.ip);
    throttle(ctx.limiters.loginByIp.hit(ip));
    const input = loginSchema.parse(request.body);
    throttle(ctx.limiters.loginEmailsPerIp.hit(ip, input.email));
    throttle(ctx.limiters.loginByEmail.attempt(input.email));
    const session = await login(ctx, input, requestMeta(request));
    ctx.limiters.loginByEmail.reset(input.email);
    setSessionCookies(ctx, reply, session);
    return reply.send(ok(await sessionPayload(ctx, session)));
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.auth) {
      await deleteSession(ctx.db, request.auth.sessionId);
      await recordAudit(ctx.db, {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        action: 'auth.logout',
        requestId: request.id,
      });
    }
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    void reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return reply.send(ok({ signedOut: true }));
  });

  app.get('/api/v1/auth/me', async (request) => {
    const auth = requireAuth(request);
    return ok(mePayload(auth, auth.csrfToken));
  });
}

export { LOGIN_WINDOW_MS, REGISTER_WINDOW_MS };
