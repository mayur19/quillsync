# ADR-0009: Tombstone GC only under causal stability: incremental childless rule plus quiescent compaction

- Status: Accepted (library implemented QS-025; server wiring planned QS-062, QS-063)
- Date: 2026-11-24
- Tickets: QS-025, QS-060, QS-061, QS-062, QS-063, QS-081
- Related: [ADR-0007](0007-origin-nearest-visible-left-neighbour.md), [ADR-0011](0011-op-log-postgres-bytea-batches.md), [system-design section 4.6](../design/system-design.md#46-tombstone-garbage-collection)

## Context and Problem Statement

Deleted characters stay in the sequence as tombstones so that concurrent ops that reference them can still integrate. Without GC, memory use and rehydration cost grow with the total edit history instead of the document size. When is it safe to remove a tombstone for good?

A naive childless rule is not enough on its own. Each typed character's origin is the previous character ([ADR-0007](0007-origin-nearest-visible-left-neighbour.md)), so a run deleted in the middle of a paragraph is usually an ancestor of live text typed after it. Ancestors are never childless, so most mid-text tombstones would never be collected.

## Decision Drivers

- Safety: no replica may later receive an op that references a removed item, or whose position depends on one.
- Real collection rates for long-lived documents, not just for deleted tails.
- No coordination round on the editing hot path.
- Offline replicas that may come back later must still be handled.

## Considered Options

1. **Two functions, both gated on causal stability.** (a) `collectGarbage(doc, stable)`: remove tombstone T only if its delete is covered by the stable vector (the pointwise minimum of all known replicas' acknowledged vectors) and T has no retained children. (b) `compactStable(doc, stable)`: when the whole document is causally stable, drop all tombstones and re-chain live items (each origin := predecessor). Replicas that join afterwards start from a snapshot.
2. Childless rule only.
3. Remove tombstones older than a wall-clock age.
4. Never GC, and rely on snapshots for load time only.
5. Rewrite children's origins and remove tombstones at any time, without a stability check.

## Decision Outcome

Chosen option: **1**. Both functions live in `packages/shared/src/crdt/gc.ts` and run in O(n).

- `collectGarbage` can run at any time. It makes one right-to-left pass, so a parent becomes collectable in the same pass once its last child has been removed. It handles deleted tails and whole deleted subtrees.
- `compactStable` runs only when `stable` covers the replica's own vector and its pending buffer is empty. Under that condition every future op has a larger Lamport stamp than every stored item. That means a future insert always lands immediately after its origin, and old tombstones and old origins no longer affect any position. All tombstones can then be dropped. Live items are re-chained so that tree materialization still reproduces the visible order.

On the server (QS-062), `collectGarbage` runs opportunistically. `compactStable` runs at snapshot time (QS-060), and the snapshot becomes the starting point for replicas whose vectors predate it.

Proof sketches for both functions are in system-design sections 4.6.1 and 4.6.2. Randomized tests in `gc.test.ts` show that a compacted replica converges with uncompacted ones after further concurrent edits.

### Consequences

- Good: memory and rehydration cost are bounded by live text plus the edits made since the last quiescent point, not by the full history.
- Good: both functions are pure and local once the stable vector is known. The server decides the vector; no extra round trip is added to editing.
- Good: `collectGarbage` keeps working during continuous editing, when full quiescence never arrives.
- Bad: compaction changes origins, so a compacted state cannot be rebuilt by replaying `document_ops`. Snapshots (QS-060) become required for joins after compaction, and op-log compaction (QS-061) must not delete rows a non-compacted path still needs.
- Bad: one long-offline replica freezes the stable vector and blocks both functions. QS-063 evicts stale replicas, which must then resync from a snapshot. Their unacknowledged ops are rebased as new local ops rather than merged by id.
- Bad: anchors (cursors, comments) may point at removed tombstones. QS-081 remaps comment anchors to the nearest retained left item before collection.

## Pros and Cons of the Options

- Childless rule only: simple and always safe, but in typical prose editing it collects little, because deleted mid-text runs are ancestors of later live text.
- Wall-clock age: simple, but unsafe while replicas are offline.
- Never GC: safe, but documents grow without bound and stay slow to load.
- Unconditional origin rewriting: collects the most, but without stability, ops still in flight may reference removed items or sort differently. That breaks convergence.
