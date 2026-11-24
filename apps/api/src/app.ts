import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import pino, { type Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import type { AppContext } from './context.js';
import type { Db } from './db/pool.js';
import { registerSessionHook } from './http/auth-guard.js';
import { registerCsrfHook } from './http/csrf.js';
import { registerErrorHandling } from './http/error-handler.js';
import { registerPendingRoutes } from './http/not-implemented.js';
import {
  createBackoffLimiter,
  createDistinctKeyLimiter,
  createRateLimiter,
  type EvictionListener,
} from './http/rate-limit.js';
import {
  registerAuthRoutes,
  LOGIN_WINDOW_MS,
  REGISTER_WINDOW_MS,
} from './modules/auth/auth.routes.js';
import { createPgOpLogStore } from './modules/collab/op-log.repository.js';
import { createRoomRegistry } from './modules/collab/room-registry.js';
import { registerSyncRoutes } from './modules/collab/sync.routes.js';
import { registerDocumentRoutes } from './modules/documents/documents.routes.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { PENDING_ROUTES } from './modules/pending/pending.routes.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const BODY_LIMIT_BYTES = 1024 * 1024;

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
      remove: true,
    },
  });
}

/** Maps TRUST_PROXY to Fastify: false, a hop count (trust the nearest N hops) or proxy IPs/CIDRs. */
export function trustProxySetting(
  value: AppConfig['TRUST_PROXY'],
): false | string[] | ((address: string, hop: number) => boolean) {
  if (typeof value === 'number') return (_address, hop) => hop < value;
  return value;
}

function createLimiters(config: AppConfig, logger: Logger): AppContext['limiters'] {
  const onEvict: EvictionListener = (store) =>
    logger.warn(
      { store },
      'limiter store full of active entries; evicted the one with the least time left',
    );
  return {
    loginByEmail: createBackoffLimiter({
      freeAttempts: config.LOGIN_EMAIL_FREE_ATTEMPTS,
      baseLockoutMs: 30_000,
      maxLockoutMs: 15 * 60_000,
      decayMs: 24 * 60 * 60_000,
      onEvict,
    }),
    loginByIp: createRateLimiter(config.LOGIN_IP_RATE_LIMIT_MAX, LOGIN_WINDOW_MS, { onEvict }),
    loginEmailsPerIp: createDistinctKeyLimiter(config.LOGIN_EMAILS_PER_IP_MAX, LOGIN_WINDOW_MS, {
      onEvict,
    }),
    registerByIp: createRateLimiter(config.REGISTER_IP_RATE_LIMIT_MAX, REGISTER_WINDOW_MS, {
      onEvict,
    }),
  };
}

export interface BuildOptions {
  readonly config: AppConfig;
  readonly db: Db;
  readonly logger?: Logger;
}

export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const logger = options.logger ?? createLogger(options.config);
  // The pino instance narrows the logger generic; route modules use the default instance type.
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: trustProxySetting(options.config.TRUST_PROXY),
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
  }) as unknown as FastifyInstance;

  const ctx: AppContext = {
    config: options.config,
    db: options.db,
    logger,
    rooms: createRoomRegistry(createPgOpLogStore(options.db), logger),
    limiters: createLimiters(options.config, logger),
  };

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: options.config.WS_MAX_MESSAGE_BYTES } });

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('x-frame-options', 'DENY');
    void reply.header('referrer-policy', 'same-origin');
    void reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    void reply.header('cache-control', 'no-store');
  });

  registerErrorHandling(app);
  registerSessionHook(app, ctx);
  registerCsrfHook(app);
  registerHealthRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerDocumentRoutes(app, ctx);
  registerSyncRoutes(app, ctx);
  registerPendingRoutes(app, PENDING_ROUTES);
  return app;
}
