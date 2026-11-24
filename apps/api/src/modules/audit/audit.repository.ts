import type { Queryable } from '../../db/pool.js';

export interface AuditEntry {
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly requestId?: string;
}

/** Append-only audit trail. Metadata must never contain secrets or document content. */
export async function recordAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (organization_id, actor_user_id, action, target_type, target_id, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.organizationId,
      entry.actorUserId,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.requestId ?? null,
    ],
  );
}
