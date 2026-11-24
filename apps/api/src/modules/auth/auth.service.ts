import { randomBytes } from 'node:crypto';
import { permissionsFor, type LoginInput, type RegisterInput } from '@quillsync/shared';
import type { AppContext } from '../../context.js';
import { withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { recordAudit } from '../audit/audit.repository.js';
import { getDummyHash, hashPassword, verifyPassword } from './password.js';
import { insertSession, type SessionRecord } from './session.repository.js';
import { csrfTokenFor, hashSessionToken, newSessionToken } from './tokens.js';
import {
  emailExists,
  findLoginCandidate,
  insertMembership,
  insertOrganization,
  insertUser,
} from './user.repository.js';

export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string;
}

export interface IssuedSession {
  readonly token: string;
  readonly csrfToken: string;
  readonly userId: string;
  readonly organizationId: string;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = randomBytes(3).toString('hex');
  return `${base.length >= 2 ? base : 'workspace'}-${suffix}`;
}

export function mePayload(record: SessionRecord, csrfToken: string) {
  return {
    user: { id: record.userId, email: record.email, displayName: record.displayName },
    organization: {
      id: record.organizationId,
      name: record.organizationName,
      slug: record.organizationSlug,
    },
    role: record.role,
    permissions: permissionsFor(record.role),
    csrfToken,
  };
}

export const REGISTRATION_ACCEPTED_MESSAGE =
  'If this email address can be used, your workspace is ready. Sign in to continue.';

/**
 * Creates an organization with its owner, atomically. To avoid account
 * enumeration the caller answers identically whether or not the email was
 * already registered (the password is hashed on both paths to equalise timing).
 * Email-verified signup through the local outbox is planned (QS-140).
 */
export async function registerOwner(
  ctx: AppContext,
  input: RegisterInput,
  meta: RequestMeta,
): Promise<{ created: boolean }> {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(ctx.db, async (tx) => {
    if (await emailExists(tx, input.email)) {
      await recordAudit(tx, {
        organizationId: null,
        actorUserId: null,
        action: 'auth.register_duplicate',
        requestId: meta.requestId,
      });
      return { created: false };
    }
    const organizationId = await insertOrganization(
      tx,
      input.organizationName,
      slugify(input.organizationName),
    );
    const userId = await insertUser(tx, {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
    });
    await insertMembership(tx, organizationId, userId, 'owner');
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      action: 'auth.register',
      targetType: 'organization',
      targetId: organizationId,
      requestId: meta.requestId,
    });
    return { created: true };
  });
}

const INVALID_CREDENTIALS = 'Email or password is incorrect';

export async function login(
  ctx: AppContext,
  input: LoginInput,
  meta: RequestMeta,
): Promise<IssuedSession> {
  const candidate = await findLoginCandidate(ctx.db, input.email);
  const valid = await verifyPassword(
    input.password,
    candidate?.passwordHash ?? (await getDummyHash()),
  );
  if (!candidate || !valid || !candidate.organizationId || !candidate.role) {
    await recordAudit(ctx.db, {
      organizationId: candidate?.organizationId ?? null,
      actorUserId: null,
      action: 'auth.login_failed',
      metadata: { reason: candidate ? 'bad_password' : 'unknown_email' },
      requestId: meta.requestId,
    });
    throw new AppError(401, 'UNAUTHENTICATED', INVALID_CREDENTIALS);
  }
  const token = newSessionToken();
  await insertSession(ctx.db, {
    tokenHash: hashSessionToken(ctx.config.SESSION_SECRET, token),
    userId: candidate.userId,
    organizationId: candidate.organizationId,
    ttlHours: ctx.config.SESSION_TTL_HOURS,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  await recordAudit(ctx.db, {
    organizationId: candidate.organizationId,
    actorUserId: candidate.userId,
    action: 'auth.login',
    requestId: meta.requestId,
  });
  return {
    token,
    csrfToken: csrfTokenFor(ctx.config.SESSION_SECRET, token),
    userId: candidate.userId,
    organizationId: candidate.organizationId,
  };
}
