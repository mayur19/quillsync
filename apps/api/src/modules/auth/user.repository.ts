import type { Role } from '@quillsync/shared';
import type { Queryable } from '../../db/pool.js';

export interface LoginCandidate {
  readonly userId: string;
  readonly passwordHash: string;
  readonly organizationId: string | null;
  readonly role: Role | null;
}

export async function findLoginCandidate(
  db: Queryable,
  email: string,
): Promise<LoginCandidate | null> {
  const { rows } = await db.query<{
    id: string;
    password_hash: string;
    organization_id: string | null;
    role: Role | null;
  }>(
    `SELECT u.id, u.password_hash, m.organization_id, m.role
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
      WHERE u.email = $1
      ORDER BY m.created_at ASC NULLS LAST
      LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.id,
    passwordHash: row.password_hash,
    organizationId: row.organization_id,
    role: row.role,
  };
}

export async function emailExists(db: Queryable, email: string): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  return (rowCount ?? 0) > 0;
}

export async function insertUser(
  db: Queryable,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [input.email, input.displayName, input.passwordHash],
  );
  return rows[0]!.id;
}

export async function insertOrganization(
  db: Queryable,
  name: string,
  slug: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
    [name, slug],
  );
  return rows[0]!.id;
}

export async function insertMembership(
  db: Queryable,
  organizationId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await db.query('INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)', [
    organizationId,
    userId,
    role,
  ]);
}
