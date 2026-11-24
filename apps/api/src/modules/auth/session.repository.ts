import type { Role } from '@quillsync/shared';
import type { Queryable } from '../../db/pool.js';

export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly role: Role;
}

export async function insertSession(
  db: Queryable,
  input: {
    tokenHash: Buffer;
    userId: string;
    organizationId: string;
    ttlHours: number;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sessions (token_hash, user_id, organization_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5, $6)
     RETURNING id`,
    [
      input.tokenHash,
      input.userId,
      input.organizationId,
      input.ttlHours,
      input.ip,
      input.userAgent?.slice(0, 300) ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function findActiveSession(
  db: Queryable,
  tokenHash: Buffer,
): Promise<SessionRecord | null> {
  const { rows } = await db.query<{
    session_id: string;
    user_id: string;
    email: string;
    display_name: string;
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    role: Role;
  }>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.display_name,
            o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug, m.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = s.organization_id
       JOIN memberships m ON m.organization_id = s.organization_id AND m.user_id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  // Throttled activity stamp: at most one write per session every five minutes.
  await db.query(
    `UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
    [row.session_id],
  );
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    role: row.role,
  };
}

export async function deleteSession(db: Queryable, sessionId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}
