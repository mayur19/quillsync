# ADR-0012: Single-process authoritative rooms with a per-room serialized queue

- Status: Accepted (multi-node via LISTEN/NOTIFY planned QS-053, ownership QS-054)
- Date: 2026-11-24
- Tickets: QS-030, QS-031, QS-053, QS-054
- Related: [ADR-0021](0021-persist-before-ack-at-least-once.md), [system-design section 5](../design/system-design.md#5-concurrency-and-consistency-strategy)

## Context and Problem Statement

The CRDT tolerates any order, but the server also persists, acknowledges and fans out. Concurrent async handlers for the same document could interleave "integrate, persist, ack", producing acks for ops not yet durable or persisting the same op twice. How is per-document work serialized?

## Decision Drivers

- Persist-before-ack must hold per batch.
- Only newly integrated ops are persisted, which requires a consistent view of the room vector at persist time.
- No distributed lock on the hot path for the single-node deployment.
- A credible path to multiple nodes.

## Considered Options

1. One in-memory room per document per process; each room chains work on a promise queue (`queue = queue.then(task)`), so integrate → persist → ack → fan-out run one batch at a time per document.
2. Stateless servers; every batch locks the document row (`SELECT ... FOR UPDATE`), reloads state, integrates, writes.
3. Actor framework or worker thread per room.

## Decision Outcome

Chosen option: **1**. `room-registry.ts` lazily creates a room on first join (rehydrating from `document_ops`) and unloads it after the last socket leaves. `room.ts` owns the authoritative replica and the queue. Different documents proceed concurrently; one document is strictly sequential.

Planned multi-node design: QS-053 publishes `NOTIFY` with `{document_id, op_row_id}` after each commit so other nodes fan out to their sockets; QS-054 elects a single owner node per document via a session-level advisory lock and forwards ops from non-owners.

### Consequences

- Good: trivially correct ordering of side effects; no row locks on the hot path.
- Good: memory is bounded by active documents.
- Bad: a slow persist stalls that document's queue (head-of-line blocking); visible as queue wait in QS-130 metrics.
- Bad: horizontal scale requires QS-053/054; until then one node is the ceiling.
- Bad: process crash drops all rooms; clients reconnect and resend, the op log restores state.

## Pros and Cons of the Options

- Row lock per batch: stateless and horizontally simple, but reload or cache invalidation on every batch and lock contention under typing load.
- Actor/worker per room: isolation, but cross-thread serialization of large states and more moving parts than a promise chain.
