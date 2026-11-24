# ADR-0014: Anchors (cursors, comments) as CRDT ItemIds

- Status: Accepted (presence implemented QS-032; comment anchors planned QS-080, QS-081)
- Date: 2026-11-24
- Tickets: QS-026, QS-032, QS-080, QS-081
- Related: [ADR-0009](0009-tombstone-gc-causal-stability-childless.md), [system-design section 4.7](../design/system-design.md#47-anchor-resolution)

## Context and Problem Statement

Remote carets and comment ranges must stay attached to the same text while others edit concurrently. Integer offsets shift with every remote insert or delete. How are positions represented?

## Decision Drivers

- Stability under concurrent edits without transforming positions.
- Resolution even if the anchored character is deleted.
- Storable in Postgres for comments.

## Considered Options

1. Anchor = ItemId of the character immediately to the left of the position, or `null` for document start.
2. Integer offsets transformed on every remote op.
3. Offset plus a text-context fingerprint (fuzzy re-anchoring).

## Decision Outcome

Chosen option: **1**. `anchors.ts` converts offset ↔ anchor. A tombstoned anchor still resolves: the position is after the nearest visible item to its left. Comment ranges (QS-080) store a start anchor and an end anchor as `(client_id, seq)` pairs in `comment_anchors`.

### Consequences

- Good: zero transformation work; a caret moves with its character automatically.
- Good: presence frames carry `{client, seq}` only, no document text.
- Good: anchors compose with version restore (QS-073), which creates new items; anchors into replaced text resolve to the restore point's left edge.
- Bad: GC may remove the anchored tombstone; QS-081 must remap comment anchors to the nearest retained left item before collection, or treat anchored tombstones as retained.
- Bad: resolution is O(n) on the array; O(log n) after QS-043.

## Pros and Cons of the Options

- Transformed offsets: OT-like bookkeeping on every op for every cursor and comment.
- Fuzzy re-anchoring: useful for imports (QS-112), unreliable for live editing.
