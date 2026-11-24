import { applyOps, visibleLength } from './document.js';
import { vectorGet, type ItemId } from './ids.js';
import { CrdtError, type DeleteOp, type DocState, type InsertOp, type Item } from './types.js';

export interface LocalChange<T> {
  readonly doc: DocState;
  readonly ops: readonly T[];
}

/** Visible items in document order. */
export function visibleItems(doc: DocState): Item[] {
  return doc.items.filter((item) => item.deletedBy === null);
}

function assertRange(doc: DocState, index: number, length: number): void {
  const max = visibleLength(doc);
  if (!Number.isInteger(index) || !Number.isInteger(length) || index < 0 || length < 0) {
    throw new CrdtError('Index and length must be non-negative integers', 'OUT_OF_RANGE');
  }
  if (index + length > max) {
    throw new CrdtError(`Range ${index}+${length} exceeds document length ${max}`, 'OUT_OF_RANGE');
  }
}

/**
 * Inserts `text` before the visible character at `index` (code-point index).
 * The first new character's origin is the nearest visible character to the left;
 * each following character's origin is its predecessor, which keeps a typed run
 * contiguous under concurrency (no interleaving with other users' runs).
 */
export function localInsert(
  doc: DocState,
  client: string,
  index: number,
  text: string,
): LocalChange<InsertOp> {
  assertRange(doc, index, 0);
  const chars = Array.from(text);
  if (chars.length === 0) return { doc, ops: [] };

  let origin: ItemId | null = index === 0 ? null : visibleItems(doc)[index - 1]!.id;
  let seq = vectorGet(doc.vector, client);
  let lamport = doc.lamport;
  const ops: InsertOp[] = chars.map((char) => {
    seq += 1;
    lamport += 1;
    const op: InsertOp = { kind: 'insert', id: { client, seq }, lamport, origin, char };
    origin = op.id;
    return op;
  });
  return { doc: applyOps(doc, ops), ops };
}

/** Deletes `length` visible characters starting at `index` (code-point index). */
export function localDelete(
  doc: DocState,
  client: string,
  index: number,
  length: number,
): LocalChange<DeleteOp> {
  assertRange(doc, index, length);
  if (length === 0) return { doc, ops: [] };

  const targets = visibleItems(doc).slice(index, index + length);
  let seq = vectorGet(doc.vector, client);
  let lamport = doc.lamport;
  const ops: DeleteOp[] = targets.map((target) => {
    seq += 1;
    lamport += 1;
    return { kind: 'delete', id: { client, seq }, lamport, target: target.id };
  });
  return { doc: applyOps(doc, ops), ops };
}
