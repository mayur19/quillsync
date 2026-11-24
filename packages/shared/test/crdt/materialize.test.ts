import { describe, expect, it } from 'vitest';
import {
  CrdtError,
  materialize,
  TREE_MERGE_THRESHOLD,
  applyOps,
  createDoc,
  localInsert,
  toText,
} from '../../src/index.js';

describe('tree materialization', () => {
  it('rejects item sets with missing origins', () => {
    expect(() =>
      materialize([
        {
          id: { client: 'alice', seq: 2 },
          lamport: 2,
          origin: { client: 'alice', seq: 1 },
          char: 'b',
          deletedBy: null,
        },
      ]),
    ).toThrow(CrdtError);
  });

  it('is used for large remote batches and matches the typed text', () => {
    const typed = localInsert(createDoc(), 'alice', 0, 'x'.repeat(TREE_MERGE_THRESHOLD + 10));
    const merged = applyOps(createDoc(), [...typed.ops].reverse());
    expect(toText(merged)).toBe(toText(typed.doc));
  });

  it('returns an empty order for an empty set', () => {
    expect(materialize([])).toEqual([]);
  });
});
