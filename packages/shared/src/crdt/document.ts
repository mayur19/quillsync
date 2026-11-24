import { compareStamps, idKey, vectorGet } from './ids.js';
import { integrateInsertInto, itemFromInsert, positionOf } from './integrate.js';
import { materialize } from './materialize.js';
import {
  CrdtError,
  type DeleteOp,
  type DocState,
  type InsertOp,
  type Item,
  type Op,
} from './types.js';

/** Remote batches larger than this are merged with the O(n log n) tree rebuild. */
export const TREE_MERGE_THRESHOLD = 32;

export function createDoc(): DocState {
  return { items: [], index: new Map(), vector: {}, clocks: {}, lamport: 0, pending: [] };
}

export function toText(doc: DocState): string {
  let text = '';
  for (const item of doc.items) if (item.deletedBy === null) text += item.char;
  return text;
}

export function visibleLength(doc: DocState): number {
  let length = 0;
  for (const item of doc.items) if (item.deletedBy === null) length += 1;
  return length;
}

/** Number of characters ever inserted that are still stored (visible + tombstones). */
export function storedLength(doc: DocState): number {
  return doc.items.length;
}

interface Work {
  readonly mode: 'scan' | 'tree';
  readonly items: Item[];
  readonly index: Map<string, Item>;
  readonly vector: Record<string, number>;
  readonly clocks: Record<string, number>;
  lamport: number;
  applied: number;
}

type Readiness = 'seen' | 'wait' | 'ready';

function readiness(work: Work, op: Op): Readiness {
  const have = vectorGet(work.vector, op.id.client);
  if (op.id.seq <= have) return 'seen';
  if (op.id.seq !== have + 1) return 'wait';
  const dependency = op.kind === 'insert' ? op.origin : op.target;
  if (dependency !== null && !work.index.has(idKey(dependency))) return 'wait';
  return 'ready';
}

function assertValidStamp(work: Work, op: Op): void {
  if (!Number.isSafeInteger(op.lamport) || op.lamport < 1) {
    throw new CrdtError(`Invalid lamport timestamp on ${idKey(op.id)}`, 'INVALID_OP');
  }
  const previous = vectorGet(work.clocks, op.id.client);
  if (op.lamport <= previous) {
    throw new CrdtError(
      `Lamport timestamp must increase per client (${idKey(op.id)})`,
      'INVALID_OP',
    );
  }
}

function applyInsert(work: Work, op: InsertOp): void {
  if ([...op.char].length !== 1) {
    throw new CrdtError(`Insert ${idKey(op.id)} must carry exactly one code point`, 'INVALID_OP');
  }
  if (op.origin !== null) {
    const origin = work.index.get(idKey(op.origin))!;
    if (op.lamport <= origin.lamport) {
      throw new CrdtError(`Insert ${idKey(op.id)} must be stamped after its origin`, 'INVALID_OP');
    }
  }
  work.index.set(idKey(op.id), itemFromInsert(op));
  if (work.mode === 'scan') integrateInsertInto(work.items, op);
}

function applyDelete(work: Work, op: DeleteOp): void {
  const key = idKey(op.target);
  const target = work.index.get(key)!;
  if (target.deletedBy !== null) return; // concurrent deletes are idempotent
  const tombstone: Item = { ...target, deletedBy: op.id };
  work.index.set(key, tombstone);
  if (work.mode === 'scan') work.items[positionOf(work.items, op.target)] = tombstone;
}

function applyReady(work: Work, op: Op): void {
  assertValidStamp(work, op);
  if (op.kind === 'insert') applyInsert(work, op);
  else applyDelete(work, op);
  work.vector[op.id.client] = op.id.seq;
  work.clocks[op.id.client] = op.lamport;
  work.lamport = Math.max(work.lamport, op.lamport);
  work.applied += 1;
}

function causalOrder(a: Op, b: Op): number {
  return compareStamps(a.lamport, a.id.client, b.lamport, b.id.client);
}

/**
 * Delivers remote (or local) operations in any order, any number of times.
 *
 * Ops are applied once their causal dependencies are present: the previous op
 * from the same client, plus the origin (insert) or target (delete). Ops that
 * are not ready stay in `pending` and are retried on the next call. Duplicates
 * are dropped, so delivery is idempotent. Throws CrdtError for malformed ops.
 */
export function applyOps(doc: DocState, ops: readonly Op[]): DocState {
  if (ops.length === 0) return doc;
  const work: Work = {
    mode: ops.length > TREE_MERGE_THRESHOLD ? 'tree' : 'scan',
    items: [...doc.items],
    index: new Map(doc.index),
    vector: { ...doc.vector },
    clocks: { ...doc.clocks },
    lamport: doc.lamport,
    applied: 0,
  };

  // Lamport order is a linear extension of causality, so a sorted queue
  // normally drains in a single pass.
  let queue = [...doc.pending, ...ops].sort(causalOrder);
  let progressed = true;
  while (progressed && queue.length > 0) {
    progressed = false;
    const waiting: Op[] = [];
    for (const op of queue) {
      const state = readiness(work, op);
      if (state === 'wait') waiting.push(op);
      else if (state === 'ready') {
        applyReady(work, op);
        progressed = true;
      }
    }
    queue = waiting;
  }

  const items =
    work.mode === 'tree' && work.applied > 0 ? materialize(work.index.values()) : work.items;
  return {
    items,
    index: work.index,
    vector: work.vector,
    clocks: work.clocks,
    lamport: work.lamport,
    pending: queue,
  };
}

/** Rebuilds a replica from scratch with the tree materializer (used by tests and rehydration). */
export function docFromOps(ops: readonly Op[]): DocState {
  const doc = applyOps(createDoc(), ops);
  return doc.items.length === 0 ? doc : { ...doc, items: materialize(doc.index.values()) };
}
