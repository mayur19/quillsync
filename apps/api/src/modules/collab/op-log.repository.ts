import { decodeRuns, encodeRuns, type OpRun } from '@quillsync/shared';
import type { Queryable } from '../../db/pool.js';

export interface OpBatch {
  readonly documentId: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly opCount: number;
  readonly runs: readonly OpRun[];
  readonly authorUserId: string | null;
}

/** Persistence port used by rooms; the Postgres adapter is below, tests may supply fakes. */
export interface OpLogStore {
  load(documentId: string): Promise<OpRun[]>;
  append(batch: OpBatch): Promise<void>;
}

export function createPgOpLogStore(db: Queryable): OpLogStore {
  return {
    async load(documentId) {
      const { rows } = await db.query<{ payload: Buffer }>(
        'SELECT payload FROM document_ops WHERE document_id = $1 ORDER BY id ASC',
        [documentId],
      );
      return rows.flatMap((row) => decodeRuns(new Uint8Array(row.payload)));
    },
    async append(batch) {
      // Insert the batch and bump the document's updated_at in one statement.
      await db.query(
        `WITH inserted AS (
           INSERT INTO document_ops
             (document_id, organization_id, client_id, seq_start, seq_end, op_count, payload, author_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (document_id, client_id, seq_start) DO NOTHING
           RETURNING document_id
         )
         UPDATE documents SET updated_at = now() WHERE id IN (SELECT document_id FROM inserted)`,
        [
          batch.documentId,
          batch.organizationId,
          batch.clientId,
          batch.seqStart,
          batch.seqEnd,
          batch.opCount,
          Buffer.from(encodeRuns(batch.runs)),
          batch.authorUserId,
        ],
      );
    },
  };
}
