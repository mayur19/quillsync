import type { Role } from '@quillsync/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { createPool, type Db } from '../src/db/pool.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { TEST_DATABASE_URL } from './db-url.js';

export const APP_ORIGIN = 'http://localhost:5104';
export const PASSWORD = 'correct-horse-battery';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: 'test-secret-that-is-definitely-longer-than-32',
    APP_ORIGIN,
    LOG_LEVEL: 'silent',
    LOGIN_IP_RATE_LIMIT_MAX: '1000',
    REGISTER_IP_RATE_LIMIT_MAX: '1000',
    ...overrides,
  });
}

export interface TestContext {
  readonly app: FastifyInstance;
  readonly db: Db;
  close(): Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const db = createPool(TEST_DATABASE_URL, 5);
  const app = await buildApp({ config: testConfig(overrides), db });
  await app.ready();
  return {
    app,
    db,
    async close() {
      await app.close();
      await db.end();
    },
  };
}

export async function truncateAll(db: Db): Promise<void> {
  await db.query(
    'TRUNCATE organizations, users, sessions, audit_log, documents, document_ops CASCADE',
  );
}

export interface Session {
  readonly cookie: string;
  readonly csrf: string;
  readonly organizationId: string;
  readonly userId: string;
}

export function cookieHeader(response: LightMyRequestResponse): string {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function login(
  app: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200)
    throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  const body = response.json();
  return {
    cookie: cookieHeader(response),
    csrf: body.data.csrfToken,
    organizationId: body.data.organization.id,
    userId: body.data.user.id,
  };
}

let counter = 0;

export async function registerOwner(
  app: FastifyInstance,
  label = 'owner',
): Promise<Session & { email: string }> {
  counter += 1;
  const email = `${label}${counter}-${Date.now()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `10.1.${counter % 250}.${(counter * 7) % 250}`,
    payload: {
      organizationName: `Org ${counter}`,
      displayName: `User ${counter}`,
      email,
      password: PASSWORD,
    },
  });
  if (response.statusCode !== 202) throw new Error(`register failed: ${response.body}`);
  return { ...(await login(app, email)), email };
}

/** Adds a member with the given role directly in the database and signs them in. */
export async function addMember(
  ctx: TestContext,
  organizationId: string,
  role: Role,
): Promise<Session> {
  counter += 1;
  const email = `${role}${counter}-${Date.now()}@example.test`;
  const user = await ctx.db.query<{ id: string }>(
    'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [email, `${role} ${counter}`, await hashPassword(PASSWORD)],
  );
  await ctx.db.query(
    'INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)',
    [organizationId, user.rows[0]!.id, role],
  );
  return login(ctx.app, email);
}

export function authed(session: Session, mutate = false): Record<string, string> {
  return mutate
    ? { cookie: session.cookie, 'x-csrf-token': session.csrf }
    : { cookie: session.cookie };
}
