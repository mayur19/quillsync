import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import type { Db } from './db/pool.js';
import type { BackoffLimiter, DistinctKeyLimiter, RateLimiter } from './http/rate-limit.js';
import type { RoomRegistry } from './modules/collab/room-registry.js';

/** Dependencies shared by route modules, created once in buildApp. */
export interface AppContext {
  readonly config: AppConfig;
  readonly db: Db;
  readonly logger: Logger;
  readonly rooms: RoomRegistry;
  /**
   * In-memory throttles (single instance only; they move to Postgres before
   * running more than one API process, see docs/security/threat-model.md).
   */
  readonly limiters: {
    readonly loginByEmail: BackoffLimiter;
    readonly loginByIp: RateLimiter;
    readonly loginEmailsPerIp: DistinctKeyLimiter;
    readonly registerByIp: RateLimiter;
  };
}
