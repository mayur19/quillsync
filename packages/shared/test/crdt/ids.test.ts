import { describe, expect, it } from 'vitest';
import {
  CLIENT_ID_PATTERN,
  compareStamps,
  mergeVectors,
  minVector,
  sameId,
  vectorDominates,
  vectorGet,
  vectorSet,
} from '../../src/index.js';

describe('ids and vectors', () => {
  it('orders stamps by lamport then client', () => {
    expect(compareStamps(2, 'a', 1, 'z')).toBeGreaterThan(0);
    expect(compareStamps(1, 'b', 1, 'a')).toBe(1);
    expect(compareStamps(1, 'a', 1, 'b')).toBe(-1);
    expect(compareStamps(1, 'a', 1, 'a')).toBe(0);
  });

  it('compares ids including null', () => {
    expect(sameId(null, null)).toBe(true);
    expect(sameId(null, { client: 'a', seq: 1 })).toBe(false);
    expect(sameId({ client: 'a', seq: 1 }, { client: 'a', seq: 1 })).toBe(true);
  });

  it('reads only own properties', () => {
    expect(vectorGet({}, 'constructor')).toBe(0);
    expect(vectorGet({ a: 3 }, 'a')).toBe(3);
  });

  it('merges, mins and compares vectors', () => {
    expect(mergeVectors({ a: 1, b: 5 }, { a: 3, c: 1 })).toEqual({ a: 3, b: 5, c: 1 });
    expect(
      minVector([
        { a: 3, b: 2 },
        { a: 1, c: 4 },
      ]),
    ).toEqual({ a: 1 });
    expect(minVector([])).toEqual({});
    expect(vectorDominates({ a: 3, b: 1 }, { a: 2 })).toBe(true);
    expect(vectorDominates({ a: 1 }, { a: 2 })).toBe(false);
    expect(vectorSet({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 });
  });

  it('accepts safe client ids only', () => {
    expect(CLIENT_ID_PATTERN.test('k3j9x2ab')).toBe(true);
    expect(CLIENT_ID_PATTERN.test('__proto__')).toBe(false);
    expect(CLIENT_ID_PATTERN.test('ab')).toBe(false);
  });
});
