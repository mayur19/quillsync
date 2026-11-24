import { describe, expect, it } from 'vitest';
import {
  CodecError,
  compressOps,
  createDoc,
  decodeRuns,
  encodeRuns,
  localInsert,
  type OpRun,
} from '../../src/index.js';
import { createRng } from '../helpers/random.js';
import { createSimulation, runRandomSession } from '../helpers/sim.js';

describe('binary codec', () => {
  it.each([1, 2, 3, 4, 5, 6])('seed %i: decode(encode(runs)) round-trips', (seed) => {
    const rng = createRng(seed * 31);
    const sim = createSimulation(4);
    runRandomSession(rng, sim, 250);
    const runs = compressOps(sim.log);
    expect(decodeRuns(encodeRuns(runs))).toEqual(runs);
  });

  it('round-trips an empty batch and large numbers', () => {
    expect(decodeRuns(encodeRuns([]))).toEqual([]);
    const big: OpRun[] = [
      {
        k: 'i',
        client: 'alice',
        seq: 2 ** 40,
        lamport: Number.MAX_SAFE_INTEGER,
        origin: { client: 'bobby', seq: 300 },
        text: '漢😀',
      },
    ];
    expect(decodeRuns(encodeRuns(big))).toEqual(big);
  });

  it('is compact for typed text', () => {
    const { ops } = localInsert(createDoc(), 'k3j9x2ab', 0, 'x'.repeat(1000));
    const bytes = encodeRuns(compressOps(ops));
    expect(bytes.length).toBeLessThan(1000 + 24);
  });

  it('rejects malformed input with CodecError', () => {
    const valid = encodeRuns(compressOps(localInsert(createDoc(), 'alice', 0, 'hi').ops));
    expect(() => decodeRuns(new Uint8Array([]))).toThrow(CodecError);
    expect(() => decodeRuns(new Uint8Array([0x00, 1]))).toThrow(/magic/);
    expect(() => decodeRuns(new Uint8Array([0x51, 9]))).toThrow(/version/);
    expect(() => decodeRuns(Uint8Array.from([...valid, 0]))).toThrow(/Trailing/);
    expect(() => decodeRuns(valid.subarray(0, valid.length - 1))).toThrow(CodecError);
    expect(() => decodeRuns(new Uint8Array([0x51, 1, 0, 1, 0, 5, 1, 1]))).toThrow(/Client index/);
    expect(() => decodeRuns(new Uint8Array([0x51, 1, 1, 1, 0xff, 0]))).toThrow(/UTF-8/);
    expect(() =>
      decodeRuns(new Uint8Array([0x51, 1, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 1])),
    ).toThrow(/too long|range/);
    expect(() => decodeRuns(new Uint8Array([0x51, 1, 1, 1, 0x61, 1, 7]))).toThrow(/tag/);
    expect(() => encodeRuns([{ k: 'd', client: 'a', seq: -1, lamport: 1, targets: [] }])).toThrow(
      CodecError,
    );
  });

  it('never throws anything but CodecError on fuzzed input', () => {
    const rng = createRng(99);
    const sim = createSimulation(3);
    runRandomSession(rng, sim, 100);
    const valid = encodeRuns(compressOps(sim.log));
    for (let i = 0; i < 3000; i += 1) {
      const bytes = rng.chance(0.5)
        ? Uint8Array.from({ length: rng.int(64) }, () => rng.int(256))
        : valid.map((byte) => (rng.chance(0.02) ? rng.int(256) : byte));
      try {
        decodeRuns(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(CodecError);
      }
    }
  });
});
