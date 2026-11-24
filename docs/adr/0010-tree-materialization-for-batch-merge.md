# ADR-0010: Timestamp-tree materialization for batch merge, scan for incremental ops

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-023, QS-031, QS-043
- Related: [ADR-0004](0004-rga-over-yata-logoot-lseq-ot.md), [system-design section 4.2](../design/system-design.md#42-timestamp-tree-materialization)

## Context and Problem Statement

Scan integration costs O(n) per op on an array. Rehydrating a room from 100 000 ops or merging a large offline batch by repeated scan is O(k·n). Is there a faster equivalent for batches?

## Decision Drivers

- Room cold-load latency (QA-LAT-4).
- A single source of truth for ordering semantics.
- Testable equivalence.

## Considered Options

1. Two equivalent algorithms: scan for small batches; rebuild the timestamp tree (parent = origin, children sorted by (lamport, client) descending) and take pre-order DFS for large batches (k > 32) and rehydration.
2. Scan only.
3. Indexed sequence structure (order-statistic B-tree) only.

## Decision Outcome

Chosen option: **1**. `materialize.ts` builds the tree in O(n log n) (sorting children) and emits document order in O(n). `document.ts` switches to materialization when a remote batch exceeds 32 ops. Property tests assert that scan and tree produce identical order for every random op set.

### Consequences

- Good: rehydration is O(n log n) instead of O(n²).
- Good: the tree is the conceptual model used in proofs (scan-stop, GC childless rule).
- Bad: two code paths; a divergence would be a convergence bug. Guarded by the equivalence property test.
- Bad: materialization rebuilds the whole array; for small k on a large document scan is faster, hence the threshold. The threshold is a constant to be tuned by QS-045 benchmarks.
- Neutral: QS-043 may replace both with O(log n) incremental integration.

## Pros and Cons of the Options

- Scan only: one code path, but O(k·n) rehydration makes cold loads of long-lived documents slow.
- B-tree only: best asymptotics, substantially more code and a harder equivalence argument; deferred to QS-043 behind benchmarks.
