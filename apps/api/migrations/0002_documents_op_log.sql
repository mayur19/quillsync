-- 0002 documents and the durable CRDT op log (QS-031, QS-033)

CREATE TABLE documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  title            text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz
);
CREATE INDEX documents_org_updated_idx ON documents (organization_id, updated_at DESC);

-- One row per accepted batch of ops from one replica. payload is the binary run
-- encoding from packages/shared/src/crdt/codec.ts. id gives the server order used
-- for rehydration; the unique key makes a retried batch a no-op.
CREATE TABLE document_ops (
  id               bigserial PRIMARY KEY,
  document_id      uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id        text NOT NULL CHECK (client_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{3,31}$'),
  seq_start        integer NOT NULL CHECK (seq_start >= 1),
  seq_end          integer NOT NULL CHECK (seq_end >= seq_start),
  op_count         integer NOT NULL CHECK (op_count >= 1),
  payload          bytea NOT NULL,
  author_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, client_id, seq_start)
);
CREATE INDEX document_ops_document_idx ON document_ops (document_id, id);
