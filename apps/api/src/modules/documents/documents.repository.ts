import type { DocumentSummary } from '@quillsync/shared';
import type { Queryable } from '../../db/pool.js';

interface DocumentRow {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

function toSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Every query is scoped by organization_id: tenant isolation lives in this layer. */
export async function listDocuments(
  db: Queryable,
  organizationId: string,
  limit: number,
): Promise<DocumentSummary[]> {
  const { rows } = await db.query<DocumentRow>(
    `SELECT id, title, created_at, updated_at FROM documents
      WHERE organization_id = $1 AND archived_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT $2`,
    [organizationId, limit],
  );
  return rows.map(toSummary);
}

export async function findDocument(
  db: Queryable,
  organizationId: string,
  id: string,
): Promise<DocumentSummary | null> {
  const { rows } = await db.query<DocumentRow>(
    `SELECT id, title, created_at, updated_at FROM documents
      WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL`,
    [organizationId, id],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function insertDocument(
  db: Queryable,
  input: { organizationId: string; title: string; createdBy: string },
): Promise<DocumentSummary> {
  const { rows } = await db.query<DocumentRow>(
    `INSERT INTO documents (organization_id, title, created_by) VALUES ($1, $2, $3)
     RETURNING id, title, created_at, updated_at`,
    [input.organizationId, input.title, input.createdBy],
  );
  return toSummary(rows[0]!);
}
