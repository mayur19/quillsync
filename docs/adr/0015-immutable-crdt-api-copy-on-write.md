# ADR-0015: Immutable CRDT API with copy-on-write

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-020..QS-026
- Related: [ADR-0012](0012-single-process-authoritative-rooms.md), [ADR-0021](0021-persist-before-ack-at-least-once.md)

## Context and Problem Statement

The CRDT state is used by React rendering on the client and by the room on the server. Should operations mutate the document in place or return a new document value?

## Decision Drivers

- The room must be able to compute the next state, persist it, and only then commit it, so a failed persist leaves the room unchanged.
- React rendering relies on reference changes.
- Property tests compare states from different delivery orders; shared mutable state hides bugs.
- Project-wide coding standard: no mutation of existing objects.

## Considered Options

1. Pure functions returning a new `CrdtDocument`; internally copy the item array and indexes on write (one copy per applied batch), sharing unchanged item objects.
2. Mutable document with explicit `clone()` where needed.
3. Persistent data structures (HAMT / finger tree) for structural sharing.

## Decision Outcome

Chosen option: **1**. `document.ts` exposes functions such as `applyRemote(doc, ops) → {doc, integrated}` and `localInsert(doc, offset, text) → {doc, ops}`. Items are frozen value objects; a delete produces a new item object with `deleted = true` and replaces it in the copied array.

### Consequences

- Good: the room does `next = applyRemote(current, ops)`, persists `next.integrated`, and assigns `room.doc = next` only after commit.
- Good: client undo/redo (QS-044) and version diff (QS-072) can retain prior states cheaply by reference.
- Good: no aliasing bugs between the editor, presence overlay and sync engine.
- Bad: each batch copies an O(n) array. Integration is already O(n), so asymptotics do not change; batching keystrokes amortizes the copy.
- Bad: GC pressure from discarded arrays; to be measured by QS-045.

## Pros and Cons of the Options

- Mutable with clone: fastest per op, but "persist then commit" needs defensive clones that are easy to forget.
- Persistent structures: O(log n) updates, but a large implementation and slower constant factors; QS-043 may revisit together with the B-tree.
