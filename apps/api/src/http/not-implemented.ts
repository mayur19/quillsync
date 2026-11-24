import type { FastifyInstance, HTTPMethods } from 'fastify';
import { AppError, unauthenticated } from './errors.js';

export interface PendingRoute {
  readonly method: HTTPMethods;
  readonly url: string;
  readonly ticket: string;
  readonly summary: string;
  /** Public routes (password reset, invitation acceptance) skip the session check. */
  readonly public?: boolean;
}

/**
 * Registers routes that are part of the documented API but not built yet. They
 * still pass through authentication so the contract (401 before 501) matches
 * the final behaviour.
 */
export function registerPendingRoutes(app: FastifyInstance, routes: readonly PendingRoute[]): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request) => {
        if (!route.public && !request.auth) throw unauthenticated();
        throw new AppError(501, 'NOT_IMPLEMENTED', `${route.summary} is not implemented yet`, {
          ticket: route.ticket,
        });
      },
    });
  }
}
