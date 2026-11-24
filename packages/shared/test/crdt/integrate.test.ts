import { describe, expect, it } from 'vitest';
import {
  applyOps,
  createDoc,
  CrdtError,
  localDelete,
  localInsert,
  scanPosition,
  storedLength,
  toText,
  visibleLength,
  type InsertOp,
  type Op,
} from '../../src/index.js';

function typed(client: string, text: string, base = createDoc()) {
  return localInsert(base, client, 0, text);
}

describe('local editing', () => {
  it('inserts and deletes by visible index', () => {
    let { doc } = typed('alice', 'hello');
    doc = localInsert(doc, 'alice', 5, ' world').doc;
    doc = localInsert(doc, 'alice', 0, '>').doc;
    expect(toText(doc)).toBe('>hello world');
    doc = localDelete(doc, 'alice', 0, 1).doc;
    doc = localDelete(doc, 'alice', 5, 6).doc;
    expect(toText(doc)).toBe('hello');
    expect(visibleLength(doc)).toBe(5);
    expect(storedLength(doc)).toBe(12);
  });

  it('assigns contiguous seq numbers and increasing lamport stamps', () => {
    const { doc, ops } = typed('alice', 'abc');
    expect(ops.map((op) => op.id.seq)).toEqual([1, 2, 3]);
    expect(ops.map((op) => op.lamport)).toEqual([1, 2, 3]);
    expect(ops[1]!.origin).toEqual({ client: 'alice', seq: 1 });
    expect(doc.vector).toEqual({ alice: 3 });
  });

  it('handles astral code points as single characters', () => {
    const { doc } = typed('alice', 'a😀b');
    expect(visibleLength(doc)).toBe(3);
    expect(toText(localDelete(doc, 'alice', 1, 1).doc)).toBe('ab');
  });

  it('never mutates the input state', () => {
    const { doc } = typed('alice', 'abc');
    const snapshot = JSON.stringify([...doc.items]);
    localInsert(doc, 'alice', 1, 'zz');
    localDelete(doc, 'alice', 0, 2);
    expect(JSON.stringify([...doc.items])).toBe(snapshot);
    expect(toText(doc)).toBe('abc');
  });

  it('returns the same state for empty edits', () => {
    const { doc } = typed('alice', 'abc');
    expect(localInsert(doc, 'alice', 1, '').doc).toBe(doc);
    expect(localDelete(doc, 'alice', 1, 0).doc).toBe(doc);
    expect(applyOps(doc, [])).toBe(doc);
  });

  it('rejects out-of-range positions', () => {
    const { doc } = typed('alice', 'abc');
    expect(() => localInsert(doc, 'alice', 4, 'x')).toThrow(CrdtError);
    expect(() => localDelete(doc, 'alice', 2, 2)).toThrow(/exceeds/);
    expect(() => localInsert(doc, 'alice', -1, 'x')).toThrow(CrdtError);
    expect(() => localInsert(doc, 'alice', 1.5, 'x')).toThrow(CrdtError);
  });
});

describe('concurrent integration', () => {
  it('orders concurrent inserts at the same origin by descending (lamport, client)', () => {
    const base = typed('alice', 'X').doc;
    const a = localInsert(base, 'alice', 1, 'a');
    const b = localInsert(base, 'bobby', 1, 'b');
    const left = applyOps(a.doc, b.ops);
    const right = applyOps(b.doc, a.ops);
    expect(toText(left)).toBe(toText(right));
    // Equal lamport (2): client id breaks the tie, larger wins the spot next to the origin.
    expect(toText(left)).toBe('Xba');
  });

  it('does not interleave concurrently typed runs', () => {
    const base = typed('alice', '[]').doc;
    const a = localInsert(base, 'alice', 1, 'hello');
    const b = localInsert(base, 'bobby', 1, 'WORLD');
    const merged = applyOps(a.doc, b.ops);
    expect(['[helloWORLD]', '[WORLDhello]']).toContain(toText(merged));
    expect(toText(applyOps(b.doc, a.ops))).toBe(toText(merged));
  });

  it('keeps an insert next to its origin after the origin is deleted concurrently', () => {
    const base = typed('alice', 'abc').doc;
    const ins = localInsert(base, 'bobby', 2, 'Z'); // after "b"
    const del = localDelete(base, 'alice', 1, 1); // delete "b"
    expect(toText(applyOps(ins.doc, del.ops))).toBe('aZc');
    expect(toText(applyOps(del.doc, ins.ops))).toBe('aZc');
  });

  it('treats concurrent deletes of the same character as one', () => {
    const base = typed('alice', 'abc').doc;
    const a = localDelete(base, 'alice', 1, 1);
    const b = localDelete(base, 'bobby', 1, 1);
    const merged = applyOps(applyOps(base, a.ops), b.ops);
    expect(toText(merged)).toBe('ac');
    expect(merged.vector).toEqual({ alice: 4, bobby: 1 });
  });

  it('computes scan position after the subtree of greater siblings', () => {
    const base = typed('alice', 'a').doc;
    const later = localInsert(base, 'bobby', 1, 'zz').doc;
    const op: InsertOp = {
      kind: 'insert',
      id: { client: 'carol', seq: 1 },
      lamport: 2,
      origin: { client: 'alice', seq: 1 },
      char: 'c',
    };
    // bobby's first char has lamport 2 and client "bobby" < "carol", so carol wins the slot.
    expect(scanPosition(later.items, op)).toBe(1);
  });
});

describe('causal delivery', () => {
  it('buffers ops until dependencies arrive, in any order', () => {
    const { ops } = typed('alice', 'abcd');
    const reversed = [...ops].reverse();
    let doc = createDoc();
    for (const op of reversed.slice(0, 3)) {
      doc = applyOps(doc, [op]);
      expect(toText(doc)).toBe('');
    }
    expect(doc.pending).toHaveLength(3);
    doc = applyOps(doc, [reversed[3]!]);
    expect(toText(doc)).toBe('abcd');
    expect(doc.pending).toHaveLength(0);
  });

  it('waits for a delete target and for per-client seq contiguity', () => {
    const ins = typed('alice', 'ab');
    const del = localDelete(ins.doc, 'bobby', 0, 2);
    let doc = applyOps(createDoc(), [del.ops[1]!]);
    expect(doc.pending).toHaveLength(1); // seq 2 before seq 1
    doc = applyOps(doc, del.ops.slice(0, 1));
    expect(doc.pending).toHaveLength(2); // targets missing
    doc = applyOps(doc, ins.ops);
    expect(toText(doc)).toBe('');
    expect(doc.pending).toHaveLength(0);
  });

  it('drops duplicates (idempotent delivery)', () => {
    const { ops } = typed('alice', 'abc');
    const once = applyOps(createDoc(), ops);
    const twice = applyOps(applyOps(once, ops), [...ops, ...ops]);
    expect(toText(twice)).toBe('abc');
    expect(twice.items).toHaveLength(3);
  });
});

describe('validation', () => {
  const origin = { client: 'alice', seq: 1 };
  const first: Op = { kind: 'insert', id: origin, lamport: 5, origin: null, char: 'a' };

  it('rejects inserts stamped at or before their origin', () => {
    const bad: Op = {
      kind: 'insert',
      id: { client: 'bobby', seq: 1 },
      lamport: 5,
      origin,
      char: 'b',
    };
    expect(() => applyOps(createDoc(), [first, bad])).toThrow(/after its origin/);
  });

  it('rejects multi-character inserts', () => {
    const bad: Op = { kind: 'insert', id: origin, lamport: 1, origin: null, char: 'ab' };
    expect(() => applyOps(createDoc(), [bad])).toThrow(/one code point/);
  });

  it('rejects non-increasing lamport stamps from one client', () => {
    const second: Op = {
      kind: 'insert',
      id: { client: 'alice', seq: 2 },
      lamport: 5,
      origin,
      char: 'b',
    };
    expect(() => applyOps(createDoc(), [first, second])).toThrow(/increase per client/);
  });

  it('rejects invalid lamport values', () => {
    const bad: Op = { kind: 'insert', id: origin, lamport: 0, origin: null, char: 'a' };
    expect(() => applyOps(createDoc(), [bad])).toThrow(CrdtError);
  });
});
