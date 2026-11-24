import { idKey, minVector, vectorCovers, vectorGet, type StateVector } from './ids.js';
import type { DocState, Item } from './types.js';

export interface GcResult {
  readonly doc: DocState;
  readonly collected: number;
}

/**
 * Clamps a stability frontier to what this replica has itself delivered, so a
 * frontier can never claim knowledge the local replica lacks.
 */
export function clampToLocal(stable: StateVector, local: StateVector): StateVector {
  const clamped: Record<string, number> = {};
  for (const client of Object.keys(stable)) {
    const seq = Math.min(vectorGet(stable, client), vectorGet(local, client));
    if (seq > 0) clamped[client] = seq;
  }
  return clamped;
}

/**
 * Removes tombstones that can never influence future integration.
 *
 * A tombstone T may be dropped when
 *   1. its delete op is causally stable (covered by `stable`, the pointwise
 *      minimum of every replica's acknowledged vector), and
 *   2. no retained item uses T as its origin (T is a leaf of the timestamp tree).
 *
 * After (1) every future op is causally after the delete, so it carries a larger
 * Lamport stamp than T and never chooses T as origin (origins are visible items).
 * The RGA scan therefore never stops on T, and removing a childless T cannot
 * change where any later insert lands. Children are always to the right of
 * their origin, so a single right-to-left pass decides everything in O(n).
 *
 * Precondition: `stable` must be derived from acknowledgements received after
 * the acknowledged ops were delivered here (causal stability). The function is
 * conservative when the replica still has undelivered pending ops: it does nothing.
 */
export function collectGarbage(doc: DocState, stable: StateVector): GcResult {
  if (doc.pending.length > 0) return { doc, collected: 0 };
  const frontier = clampToLocal(stable, doc.vector);
  const retainedChildren = new Map<string, number>();
  const kept: Item[] = [];

  for (let i = doc.items.length - 1; i >= 0; i -= 1) {
    const item = doc.items[i]!;
    const key = idKey(item.id);
    const collectable =
      item.deletedBy !== null &&
      vectorCovers(frontier, item.deletedBy) &&
      (retainedChildren.get(key) ?? 0) === 0;
    if (collectable) continue;
    kept.push(item);
    if (item.origin !== null) {
      const originKey = idKey(item.origin);
      retainedChildren.set(originKey, (retainedChildren.get(originKey) ?? 0) + 1);
    }
  }

  const collected = doc.items.length - kept.length;
  if (collected === 0) return { doc, collected: 0 };
  kept.reverse();
  return {
    doc: { ...doc, items: kept, index: new Map(kept.map((item) => [idKey(item.id), item])) },
    collected,
  };
}

/** Convenience: GC against the minimum of the supplied replica vectors. */
export function collectWithReplicaVectors(
  doc: DocState,
  replicaVectors: readonly StateVector[],
): GcResult {
  return collectGarbage(doc, minVector([doc.vector, ...replicaVectors]));
}

/**
 * Quiescent compaction: when the whole document is causally stable (the
 * frontier covers everything delivered here and nothing is pending), every
 * future op is causally after every stored item and therefore carries a larger
 * Lamport stamp. A future insert then always lands immediately after its origin,
 * whatever tombstones or tree shape exist. That allows dropping ALL tombstones
 * and re-chaining origins (each live item's origin becomes its predecessor), so
 * the tree materializer stays consistent with the compacted order.
 *
 * Returns the input unchanged when the document is not fully stable. Replicas
 * that joined after compaction must start from a snapshot, not the op log.
 */
export function compactStable(doc: DocState, stable: StateVector): GcResult {
  if (doc.pending.length > 0) return { doc, collected: 0 };
  const fullyStable = Object.entries(doc.vector).every(
    ([client, seq]) => vectorGet(stable, client) >= seq,
  );
  if (!fullyStable) return { doc, collected: 0 };

  const live = doc.items.filter((item) => item.deletedBy === null);
  const collected = doc.items.length - live.length;
  let previous: Item | null = null;
  const chained = live.map((item) => {
    const next: Item = { ...item, origin: previous === null ? null : previous.id };
    previous = next;
    return next;
  });
  return {
    doc: { ...doc, items: chained, index: new Map(chained.map((item) => [idKey(item.id), item])) },
    collected,
  };
}
