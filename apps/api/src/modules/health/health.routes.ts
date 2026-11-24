import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { ok } from '../../http/envelope.js';
import { AppError } from '../../http/errors.js';

const startedAt = Date.now();

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', async () =>
    ok({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      rooms: ctx.rooms.loadedCount(),
    }),
  );

  app.get('/api/ready', async () => {
    try {
      const { rows } = await ctx.db.query<{ count: string }>(
        'SELECT count(*) FROM schema_migrations',
      );
      return ok({ status: 'ready', database: 'up', migrations: Number(rows[0]?.count ?? 0) });
    } catch (error) {
      ctx.logger.warn({ err: error }, 'readiness check failed');
      throw new AppError(503, 'UNAVAILABLE', 'Database is not reachable');
    }
  });
}
