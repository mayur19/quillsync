import { compareStamps, idKey, type ItemId } from './ids.js';
import type { InsertOp, Item } from './types.js';

/** Linear search for an item's position; -1 when absent. */
export function positionOf(items: readonly Item[], id: ItemId): number {
  const key = idKey(id);
  for (let i = 0; i < items.length; i += 1) {
    if (idKey(items[i]!.id) === key) return i;
  }
  return -1;
}

/**
 * Index at which the RGA scan places `op` inside `items`.
 *
 * Start immediately to the right of the origin and skip every item whose
 * (lamport, client) stamp is greater than the new item's. Items inserted after
 * the same origin with a greater stamp, and all of their descendants (whose
 * stamps are greater still), are skipped; the scan stops at the first smaller
 * sibling or at the end of the origin's subtree. See docs/design/system-design.md.
 */
export function scanPosition(items: readonly Item[], op: InsertOp): number {
  let pos = op.origin === null ? 0 : positionOf(items, op.origin) + 1;
  while (pos < items.length) {
    const other = items[pos]!;
    if (compareStamps(other.lamport, other.id.client, op.lamport, op.id.client) <= 0) break;
    pos += 1;
  }
  return pos;
}

export function itemFromInsert(op: InsertOp): Item {
  return { id: op.id, lamport: op.lamport, origin: op.origin, char: op.char, deletedBy: null };
}

/**
 * Integrates an insert into a working array owned by the caller. Used only on
 * private copies inside `applyOps`, so the public API stays immutable.
 */
export function integrateInsertInto(work: Item[], op: InsertOp): void {
  work.splice(scanPosition(work, op), 0, itemFromInsert(op));
}
