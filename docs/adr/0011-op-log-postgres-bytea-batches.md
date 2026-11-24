# ADR-0011: Op log in PostgreSQL as bytea batches; snapshots and compaction planned

- Status: Accepted (op log implemented QS-031; snapshots QS-060 and compaction QS-061 planned)
- Date: 2026-11-24
- Tickets: QS-031, QS-060, QS-061, QS-064
- Related: [ADR-0005](0005-per-character-items-run-length-encoding.md), [ADR-0021](0021-persist-before-ack-at-least-once.md), [data-model](../design/data-model.md)

## Context and Problem Statement

Integrated ops must be durable before they are acknowledged. How are they stored so that rooms can rehydrate, duplicates are rejected, and storage stays bounded?

## Decision Drivers

- One durable write per incoming batch on the hot path.
- Idempotency under resend and (planned) multiple writers.
- Rehydration by sequential read.
- Same transactional store as identity and metadata; no extra infrastructure.

## Considered Options

1. Table `document_ops`: one row per integrated batch, `payload bytea` = binary codec of the batch's runs, with `client_id`, `seq_start`, `seq_end`, `op_count`, `author_user_id`, server order `id bigserial`, and `UNIQUE(document_id, client_id, seq_start)`.
2. One row per op (character).
3. Store only the latest full document state, overwrite on each change.
4. Separate log store (Kafka, file-based append log).

## Decision Outcome

Chosen option: **1**. Rehydration is `SELECT payload ... WHERE document_id = $1 ORDER BY id`, decode, materialize. Planned: `document_snapshots` (QS-060) stores the encoded full item list plus the vector and the last covered `document_ops.id`; rehydration becomes "latest snapshot + tail"; compaction (QS-061) deletes op rows covered by a snapshot older than the version-retention horizon.

Each batch is attributed to one client because a frame comes from one socket; a batch's seq range is contiguous for that client after the room filters already-seen ops.

### Consequences

- Good: write amplification proportional to batches; payloads are near plain-text size.
- Good: the unique constraint makes a duplicate insert a no-op (`ON CONFLICT DO NOTHING`) and guards against two writers in the multi-node design.
- Good: `pg_dump` captures documents and identity consistently (QS-064).
- Bad: payloads are opaque to SQL; analytics and search need projections (QS-100).
- Bad: until QS-060/061 the log grows without bound and rehydration time grows with history.

## Pros and Cons of the Options

- Row per op: queryable, but millions of rows per active document and one insert per keystroke.
- Latest state only: compact, loses history needed for versions (QS-070) and for replicas that resync by delta.
- External log: better throughput ceilings, new infrastructure and a dual-write problem with Postgres metadata.
