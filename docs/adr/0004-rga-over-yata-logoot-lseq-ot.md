# ADR-0004: RGA as the sequence algorithm (over YATA, Logoot/LSEQ and OT)

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-021, QS-023
- Related: [ADR-0003](0003-in-house-crdt-instead-of-libraries.md), [ADR-0007](0007-origin-nearest-visible-left-neighbour.md), [ADR-0010](0010-tree-materialization-for-batch-merge.md)

## Context and Problem Statement

Given an in-house implementation, which concurrency algorithm should define the order of concurrently inserted characters?

## Decision Drivers

- Provable convergence with a short, reviewable proof.
- No interleaving of concurrently typed runs at the same position (intention preservation for the common case).
- Bounded metadata per character independent of edit history (no identifier growth).
- Works peer-to-peer in principle, so offline edits (QS-120) and multi-node rooms (QS-053) need no central transform.
- Admits an O(n log n) batch formulation for rehydration.

## Considered Options

1. RGA (Replicated Growable Array): each insert references a left origin; ties broken by (lamport, client) descending.
2. YATA (Yjs): left and right origins, conflict resolution by scanning between them.
3. Logoot / LSEQ: dense position identifiers allocated between neighbours.
4. Operational Transformation (Jupiter / Google Wave style) with a central server.

## Decision Outcome

Chosen option: **1, RGA with left origin and (lamport, client) ordering**. Insert integration scans right of the origin and skips every item with a greater key; the equivalent timestamp tree (parent = origin, children sorted by key descending, document = pre-order) gives the O(n log n) batch path.

### Consequences

- Good: convergence follows from a total order on keys plus the tree equivalence; proof sketch in [system-design section 4.1](../design/system-design.md#41-rga-scan-integration).
- Good: constant-size metadata per item: id `{client, seq}`, `lamport`, `origin`, `deleted` flag.
- Good: with origin = previous character of a run, concurrent runs at the same position stay contiguous ([ADR-0007](0007-origin-nearest-visible-left-neighbour.md)).
- Bad: RGA can interleave in one corner case YATA avoids: when two users insert concurrently _backwards_ (typing then moving the caret left repeatedly). Accepted; uncommon in prose editing.
- Bad: tombstones are retained until GC ([ADR-0009](0009-tombstone-gc-causal-stability-childless.md)).

## Pros and Cons of the Options

- YATA: better interleaving behaviour, but two origins per item and a more intricate integration loop whose correctness proof is longer; Yjs already exists if YATA were the goal.
- Logoot/LSEQ: no tombstones needed for ordering, but identifiers grow with concurrent inserts at the same gap and are known to interleave concurrent runs character by character.
- OT: requires a transformation function for every op pair and a central sequencer; offline edits and multi-node ownership become hard; correctness history of OT variants is poor (TP2 violations).
