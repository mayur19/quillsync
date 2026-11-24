# ADR-0003: In-house sequence CRDT instead of an external CRDT library

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-020..QS-027
- Related: [ADR-0004](0004-rga-over-yata-logoot-lseq-ot.md), [ADR-0015](0015-immutable-crdt-api-copy-on-write.md), [system-design section 4](../design/system-design.md#4-core-algorithms)

## Context and Problem Statement

Real-time co-editing needs a replicated data type whose replicas converge under concurrent edits without a central lock. Mature libraries exist (Yjs, Automerge, diamond-types). Should quillsync adopt one or own its CRDT?

## Decision Drivers

- The persistence model (op log rows, snapshots, server-side GC frontier, version restore as forward ops) must be designed around the CRDT's internals, not around an opaque binary update format.
- Comments, cursors and version history depend on stable item identities ([ADR-0014](0014-anchors-as-item-ids.md)); the identity scheme must be ours to evolve.
- Tombstone GC must be server-coordinated using acknowledged vectors (QS-062); libraries either do not GC or GC locally with different safety assumptions.
- The server must validate and authorize individual ops (per-op RBAC, future per-connection rate limits QS-052), which requires decoding ops into domain values.
- Every line of the merge path must be testable by the seeded property harness (QS-027).

## Considered Options

1. In-house RGA in `packages/shared/src/crdt` (pure TypeScript).
2. Yjs (YATA) with y-websocket-style server and Yjs update blobs in Postgres.
3. Automerge 2 (Rust core compiled to WASM).
4. diamond-types or other research implementations.

## Decision Outcome

Chosen option: **1, in-house RGA**. The library is roughly a dozen small modules (`ids`, `types`, `integrate`, `materialize`, `causal`, `document`, `local-ops`, `gc`, `anchors`, `runs`, `codec`) with property-based convergence tests.

### Consequences

- Good: op format, identity, encoding and GC are designed together with the Postgres schema (`document_ops`, planned `document_snapshots`, `document_replicas`).
- Good: the server inspects every op (author, target, run boundaries) and can enforce permissions per op.
- Good: no WASM or native dependency; identical code in Node and browser.
- Bad: we own correctness. Mitigated by the seeded convergence harness, scan/tree equivalence tests and codec fuzzing; QS-045 adds large-scale fuzzing.
- Bad: we own performance. The O(n) array integration is slower than Yjs's linked structure for very large documents; QS-043 (order-statistic B-tree) is the planned remedy.
- Bad: rich text (QS-040), blocks (QS-041), moves (QS-042) and undo (QS-044) must be built rather than adopted; these account for a large share of the remaining backlog.

## Pros and Cons of the Options

- Yjs: excellent performance and ecosystem; update blobs are opaque to the server, GC is local and per-document, and item identity is internal. Adopting it would make QS-062, QS-073 and QS-081 work around the library instead of with it.
- Automerge: rich data model and history; WASM bundle size and a document-level binary format that again hides individual ops from the server.
- Research implementations: fast, but small user bases and unstable APIs.
