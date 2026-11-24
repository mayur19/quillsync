import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PENDING_ROUTES } from '../src/modules/pending/pending.routes.js';
import {
  authed,
  createTestContext,
  registerOwner,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let owner: Session;
beforeAll(async () => {
  ctx = await createTestContext();
  owner = await registerOwner(ctx.app);
});
afterAll(async () => ctx.close());

const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';

describe('pending endpoints', () => {
  it.each(PENDING_ROUTES.map((r) => [r.method, r.url, r.ticket, r.public ?? false] as const))(
    '%s %s returns 501 with ticket %s',
    async (method, url, ticket) => {
      const response = await ctx.app.inject({
        method,
        url: url.replace(/:[A-Za-z]+/g, SAMPLE_ID),
        headers: authed(owner, true),
        ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
      });
      expect(response.statusCode).toBe(501);
      expect(response.json()).toEqual({
        data: null,
        error: { code: 'NOT_IMPLEMENTED', message: expect.any(String), details: { ticket } },
      });
    },
  );

  it('requires a session on non-public pending routes', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/search' });
    expect(response.statusCode).toBe(401);
    const publicRoute = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      payload: {},
    });
    expect(publicRoute.statusCode).toBe(501);
  });
});
