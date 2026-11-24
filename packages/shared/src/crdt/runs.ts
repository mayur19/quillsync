import { sameId, type ItemId } from './ids.js';
import type { DeleteOp, InsertOp, Op } from './types.js';

/**
 * Run-length form of operations used on the wire and in the op log.
 *
 * Typing produces long chains of inserts from one client whose seq and lamport
 * increase by one and whose origin is the previous character; such a chain is a
 * single InsertRun. Likewise a selection delete becomes one DeleteRun whose
 * targets are compressed into contiguous (client, seq, len) ranges.
 */
export interface InsertRun {
  readonly k: 'i';
  readonly client: string;
  readonly seq: number;
  readonly lamport: number;
  readonly origin: ItemId | null;
  readonly text: string;
}

export interface TargetRange {
  readonly client: string;
  readonly seq: number;
  readonly len: number;
}

export interface DeleteRun {
  readonly k: 'd';
  readonly client: string;
  readonly seq: number;
  readonly lamport: number;
  readonly targets: readonly TargetRange[];
}

export type OpRun = InsertRun | DeleteRun;

export function runLength(run: OpRun): number {
  return run.k === 'i'
    ? Array.from(run.text).length
    : run.targets.reduce((sum, range) => sum + range.len, 0);
}

interface Builder {
  run: OpRun;
  length: number;
  lastId: ItemId;
}

function extendsInsert(builder: Builder, op: InsertOp): boolean {
  const { run, length } = builder;
  return (
    run.k === 'i' &&
    run.client === op.id.client &&
    op.id.seq === run.seq + length &&
    op.lamport === run.lamport + length &&
    sameId(op.origin, builder.lastId)
  );
}

function extendsDelete(builder: Builder, op: DeleteOp): boolean {
  const { run, length } = builder;
  return (
    run.k === 'd' &&
    run.client === op.id.client &&
    op.id.seq === run.seq + length &&
    op.lamport === run.lamport + length
  );
}

function appendTarget(targets: readonly TargetRange[], target: ItemId): TargetRange[] {
  const last = targets[targets.length - 1];
  if (last && last.client === target.client && last.seq + last.len === target.seq) {
    return [...targets.slice(0, -1), { ...last, len: last.len + 1 }];
  }
  return [...targets, { client: target.client, seq: target.seq, len: 1 }];
}

function startRun(op: Op): OpRun {
  const base = { client: op.id.client, seq: op.id.seq, lamport: op.lamport };
  return op.kind === 'insert'
    ? { k: 'i', ...base, origin: op.origin, text: op.char }
    : { k: 'd', ...base, targets: [{ client: op.target.client, seq: op.target.seq, len: 1 }] };
}

/** Compresses ops (kept in the given order) into runs. */
export function compressOps(ops: readonly Op[]): OpRun[] {
  const runs: OpRun[] = [];
  let builder: Builder | null = null;
  for (const op of ops) {
    if (builder && op.kind === 'insert' && extendsInsert(builder, op)) {
      const run = builder.run as InsertRun;
      builder = {
        run: { ...run, text: run.text + op.char },
        length: builder.length + 1,
        lastId: op.id,
      };
    } else if (builder && op.kind === 'delete' && extendsDelete(builder, op)) {
      const run = builder.run as DeleteRun;
      builder = {
        run: { ...run, targets: appendTarget(run.targets, op.target) },
        length: builder.length + 1,
        lastId: op.id,
      };
    } else {
      if (builder) runs.push(builder.run);
      builder = { run: startRun(op), length: 1, lastId: op.id };
    }
  }
  if (builder) runs.push(builder.run);
  return runs;
}

function expandInsert(run: InsertRun): InsertOp[] {
  let origin = run.origin;
  return Array.from(run.text).map((char, offset) => {
    const op: InsertOp = {
      kind: 'insert',
      id: { client: run.client, seq: run.seq + offset },
      lamport: run.lamport + offset,
      origin,
      char,
    };
    origin = op.id;
    return op;
  });
}

function expandDelete(run: DeleteRun): DeleteOp[] {
  const targets = run.targets.flatMap((range) =>
    Array.from({ length: range.len }, (_, i) => ({ client: range.client, seq: range.seq + i })),
  );
  return targets.map((target, offset) => ({
    kind: 'delete',
    id: { client: run.client, seq: run.seq + offset },
    lamport: run.lamport + offset,
    target,
  }));
}

export function expandRuns(runs: readonly OpRun[]): Op[] {
  return runs.flatMap((run): Op[] => (run.k === 'i' ? expandInsert(run) : expandDelete(run)));
}
