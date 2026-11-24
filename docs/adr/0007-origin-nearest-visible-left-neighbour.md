# ADR-0007: Insert origin is the nearest visible left neighbour

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-021, QS-025
- Related: [ADR-0004](0004-rga-over-yata-logoot-lseq-ot.md), [ADR-0009](0009-tombstone-gc-causal-stability-childless.md)

## Context and Problem Statement

When a user inserts at visible offset k, the new item must reference an origin. Candidates are the visible character at k-1, the item immediately to the left in the full sequence (which may be a tombstone), or a pair of left and right neighbours.

## Decision Drivers

- Intention preservation: the character must appear right after what the user saw on their left.
- Tombstones should not acquire new children, so GC can collect them ([ADR-0009](0009-tombstone-gc-causal-stability-childless.md)).
- One origin per item keeps the RGA tree formulation.

## Considered Options

1. Origin = nearest **visible** item to the left at creation time (`null` = document start).
2. Origin = immediate left item in the full sequence including tombstones.
3. Left and right origins (YATA).

## Decision Outcome

Chosen option: **1**. `local-ops.ts` resolves offset k to the k-th visible item and uses its id as origin; inserting at offset 0 uses `null`. Inside a run typed in one burst, each character's origin is the previous character of the run, so the whole run forms a chain in the timestamp tree and concurrent runs at the same position cannot interleave.

### Consequences

- Good: a tombstone gains children only from ops created **before** the creator saw the delete. After the delete is causally stable no new child can appear, which is the precondition of the childless GC rule. Because a run's characters chain through their origins, deleted mid-text runs usually stay ancestors of live text; quiescent compaction (`compactStable`, ADR-0009) handles those.
- Good: visible behaviour matches the user's view: text typed after "foo" lands after "foo" even if a deleted region sits between.
- Bad: when a tombstone sits between the visible origin and the insertion point, the new item is placed relative to the visible origin's children, which may reorder it relative to old tombstones. Invisible to users and irrelevant to convergence.

## Pros and Cons of the Options

- Immediate left including tombstones: marginally more precise placement among tombstones, but tombstones keep acquiring children forever and GC becomes impossible without rewriting origins.
- Two origins: better interleaving, larger items, different proof (see ADR-0004).
