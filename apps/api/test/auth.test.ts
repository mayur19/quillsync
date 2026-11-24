import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authed,
  cookieHeader,
  createTestContext,
  login,
  PASSWORD,
  registerOwner,
  truncateAll,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => truncateAll(ctx.db));

function register(email: string, ip = '10.9.9.9', password = PASSWORD) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: ip,
    payload: { organizationName: 'Acme Docs', displayName: 'Ada', email, password },
  });
}

describe('registration', () => {
  it('creates an organization owner who can then sign in', async () => {
    const response = await register('Ada@Example.test');
    expect(response.statusCode).toBe(202);
    expect(response.cookies).toHaveLength(0);
    const session = await login(ctx.app, 'ada@example.test');
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authed(session),
    });
    expect(me.json().data).toMatchObject({
      user: { email: 'ada@example.test', displayName: 'Ada' },
      organization: { name: 'Acme Docs' },
      role: 'owner',
    });
    expect(me.json().data.permissions).toContain('member:manage');
    const audit = await ctx.db.query('SELECT action FROM audit_log ORDER BY id');
    expect(audit.rows.map((r) => r.action)).toEqual(['auth.register', 'auth.login']);
  });

  it('answers identically when the email is already registered (no enumeration)', async () => {
    const first = await register('dup@example.test');
    const second = await register('dup@example.test', '10.9.9.9', 'a-different-password');
    expect(second.statusCode).toBe(first.statusCode);
    expect(second.json()).toEqual(first.json());
    expect(second.cookies).toHaveLength(0);
    const users = await ctx.db.query('SELECT count(*)::int AS n FROM users');
    expect(users.rows[0].n).toBe(1);
    const audit = await ctx.db.query(
      "SELECT 1 FROM audit_log WHERE action = 'auth.register_duplicate'",
    );
    expect(audit.rowCount).toBe(1);
  });

  it('validates input', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { organizationName: 'A', displayName: '', email: 'nope', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(response.json().error.details.issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe('sessions', () => {
  it('rejects bad credentials with a generic message', async () => {
    await registerOwner(ctx.app);
    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.test', password: 'whatever-123' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe('Email or password is incorrect');
  });

  it('sets HttpOnly session and readable CSRF cookies', async () => {
    const { email } = await registerOwner(ctx.app);
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const session = response.cookies.find((c) => c.name === 'qs_session')!;
    const csrf = response.cookies.find((c) => c.name === 'qs_csrf')!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Lax');
    expect(csrf.httpOnly).toBeUndefined();
    expect(csrf.value).toBe(response.json().data.csrfToken);
  });

  it('requires a session for me and invalidates it on logout', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401);
    const session = await registerOwner(ctx.app);
    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: authed(session, true),
    });
    expect(logout.statusCode).toBe(200);
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authed(session),
    });
    expect(me.statusCode).toBe(401);
    const anonymous = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(anonymous.statusCode).toBe(200);
  });

  it('ignores forged or expired session cookies', async () => {
    const forged = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: 'qs_session=forged' },
    });
    expect(forged.statusCode).toBe(401);
    const session = await registerOwner(ctx.app);
    await ctx.db.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authed(session) }))
        .statusCode,
    ).toBe(401);
  });
});

describe('CSRF', () => {
  it('rejects authenticated mutations without a valid token', async () => {
    const session = await registerOwner(ctx.app);
    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: authed(session),
      payload: { title: 'x' },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe('CSRF_INVALID');
    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { ...authed(session), 'x-csrf-token': 'nope' },
      payload: { title: 'x' },
    });
    expect(wrong.statusCode).toBe(403);
    const good = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: authed(session, true),
      payload: { title: 'x' },
    });
    expect(good.statusCode).toBe(201);
  });
});

describe('throttling', () => {
  let strict: TestContext;
  beforeAll(async () => {
    strict = await createTestContext({
      LOGIN_EMAIL_FREE_ATTEMPTS: '2',
      LOGIN_IP_RATE_LIMIT_MAX: '4',
      LOGIN_EMAILS_PER_IP_MAX: '3',
      REGISTER_IP_RATE_LIMIT_MAX: '2',
    });
  });
  afterAll(async () => strict.close());

  const attempt = (email: string, ip: string, password = 'wrong-password-1') =>
    strict.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: ip,
      payload: { email, password },
    });

  it('locks an email out progressively even when attempts come from many IPs', async () => {
    expect((await attempt('victim@example.test', '10.0.0.1')).statusCode).toBe(401);
    expect((await attempt('victim@example.test', '10.0.0.2')).statusCode).toBe(401);
    expect((await attempt('victim@example.test', '10.0.0.3')).statusCode).toBe(401); // starts 30 s lockout
    const locked = await attempt('victim@example.test', '10.0.0.4');
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('RATE_LIMITED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('limits a single IP spraying passwords across many emails', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await attempt(`user${i}@example.test`, '10.0.1.1')).statusCode).toBe(401);
    }
    // Fourth distinct email from one IP is refused by the distinct-email cap.
    expect((await attempt('user9@example.test', '10.0.1.1')).statusCode).toBe(429);
    // The plain per-IP counter also caps repeated tries (4 per window).
    expect((await attempt('user0@example.test', '10.0.1.1')).statusCode).toBe(429);
    expect((await attempt('user9@example.test', '10.0.1.2')).statusCode).toBe(401);
  });

  it('treats IPv6 addresses in one /64 as a single source', async () => {
    for (let i = 1; i <= 4; i += 1) {
      expect((await attempt('six@example.test', `2001:db8:1:2::${i}`)).statusCode).not.toBe(200);
    }
    expect((await attempt('six2@example.test', '2001:db8:1:2::99')).statusCode).toBe(429);
    expect((await attempt('six2@example.test', '2001:db8:1:3::1')).statusCode).toBe(401);
  });

  it('cannot be bypassed by firing bad logins in parallel', async () => {
    const owner = await registerOwner(strict.app);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => attempt(owner.email, `10.0.4.${i + 1}`)),
    );
    const codes = results.map((r) => r.statusCode).sort();
    // free attempts (2) + the attempt that starts the lockout (1); the rest are refused before any await.
    expect(codes).toEqual([401, 401, 401, 429, 429, 429, 429, 429]);
  });

  it('rate-limits registration per IP', async () => {
    const reg = (n: number) =>
      strict.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        remoteAddress: '10.0.2.1',
        payload: {
          organizationName: 'Spam Org',
          displayName: 'S',
          email: `s${n}@example.test`,
          password: PASSWORD,
        },
      });
    expect((await reg(1)).statusCode).toBe(202);
    expect((await reg(2)).statusCode).toBe(202);
    expect((await reg(3)).statusCode).toBe(429);
  });

  it('clears the email counter after a successful sign-in', async () => {
    const owner = await registerOwner(strict.app);
    await attempt(owner.email, '10.0.3.1');
    await attempt(owner.email, '10.0.3.2');
    const ok = await attempt(owner.email, '10.0.3.3', PASSWORD);
    expect(ok.statusCode).toBe(200);
    expect(cookieHeader(ok)).toContain('qs_session=');
    expect((await attempt(owner.email, '10.0.3.4')).statusCode).toBe(401);
    expect((await attempt(owner.email, '10.0.3.5')).statusCode).toBe(401);
  });
});
