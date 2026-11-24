import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

describe('health and conventions', () => {
  it('reports liveness and readiness', async () => {
    const health = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toMatchObject({ data: { status: 'ok', rooms: 0 }, error: null });
    const ready = await ctx.app.inject({ method: 'GET', url: '/api/ready' });
    expect(ready.json().data).toMatchObject({ status: 'ready', database: 'up', migrations: 2 });
  });

  it('echoes valid request ids and sets security headers', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'abc12345-test' },
    });
    expect(response.headers['x-request-id']).toBe('abc12345-test');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    const replaced = await ctx.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'bad id!' },
    });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('wraps unknown routes and malformed bodies in the error envelope', async () => {
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/nope?x=1' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      data: null,
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' },
    });
    const malformed = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION_ERROR');
    const huge = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(huge.statusCode).toBe(413);
  });
});

describe('readiness without a database', () => {
  it('returns 503 when Postgres is unreachable', async () => {
    const broken = await createTestContext();
    await broken.db.end();
    const response = await broken.app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UNAVAILABLE');
    await broken.app.close();
  });
});
