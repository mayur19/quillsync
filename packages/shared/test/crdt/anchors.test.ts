import { describe, expect, it } from 'vitest';
import {
  anchorAt,
  applyOps,
  createDoc,
  CrdtError,
  localDelete,
  localInsert,
  resolveAnchor,
} from '../../src/index.js';

describe('anchors', () => {
  const base = localInsert(createDoc(), 'alice', 0, 'hello').doc;

  it('maps offsets to the id of the character on the left', () => {
    expect(anchorAt(base, 0)).toBeNull();
    expect(anchorAt(base, 2)).toEqual({ client: 'alice', seq: 2 });
    expect(resolveAnchor(base, null)).toBe(0);
    expect(resolveAnchor(base, anchorAt(base, 5))).toBe(5);
  });

  it('stays attached to its character when text is inserted before it', () => {
    const anchor = anchorAt(base, 3); // after "hel"
    const remote = localInsert(base, 'bobby', 0, '>>> ');
    expect(resolveAnchor(applyOps(base, remote.ops), anchor)).toBe(7);
  });

  it('resolves a tombstoned anchor to where the character used to be', () => {
    const anchor = anchorAt(base, 3); // "l" at index 2
    const deleted = localDelete(base, 'bobby', 1, 3).doc; // remove "ell"
    expect(resolveAnchor(deleted, anchor)).toBe(1);
  });

  it('returns null for unknown anchors and rejects bad offsets', () => {
    expect(resolveAnchor(base, { client: 'ghost', seq: 1 })).toBeNull();
    expect(() => anchorAt(base, 6)).toThrow(CrdtError);
    expect(() => anchorAt(base, -1)).toThrow(CrdtError);
  });
});
