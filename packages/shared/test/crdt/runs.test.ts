import { describe, expect, it } from 'vitest';
import {
  compressOps,
  createDoc,
  expandRuns,
  localDelete,
  localInsert,
  opsMissingFrom,
  runLength,
} from '../../src/index.js';
import { createRng } from '../helpers/random.js';
import { createSimulation, runRandomSession } from '../helpers/sim.js';

describe('run-length compression', () => {
  it('turns a typed burst into a single insert run', () => {
    const { ops } = localInsert(createDoc(), 'alice', 0, 'hello world');
    const runs = compressOps(ops);
    expect(runs).toEqual([
      { k: 'i', client: 'alice', seq: 1, lamport: 1, origin: null, text: 'hello world' },
    ]);
    expect(runLength(runs[0]!)).toBe(11);
  });

  it('turns a selection delete into one run with one target range', () => {
    const typed = localInsert(createDoc(), 'alice', 0, 'abcdef');
    const { ops } = localDelete(typed.doc, 'alice', 1, 4);
    const runs = compressOps(ops);
    expect(runs).toEqual([
      {
        k: 'd',
        client: 'alice',
        seq: 7,
        lamport: 7,
        targets: [{ client: 'alice', seq: 2, len: 4 }],
      },
    ]);
    expect(runLength(runs[0]!)).toBe(4);
  });

  it('splits runs when the chain breaks', () => {
    let doc = localInsert(createDoc(), 'alice', 0, 'ab').doc;
    const first = localInsert(doc, 'alice', 2, 'cd');
    doc = first.doc;
    const second = localInsert(doc, 'alice', 0, 'Z');
    const runs = compressOps([...first.ops, ...second.ops]);
    expect(runs).toHaveLength(2);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i: expand(compress(ops)) is the identity', (seed) => {
    const rng = createRng(seed);
    const sim = createSimulation(3);
    runRandomSession(rng, sim, 200);
    const runs = compressOps(sim.log);
    expect(runs.length).toBeLessThanOrEqual(sim.log.length);
    expect(expandRuns(runs)).toEqual(sim.log);
  });

  it('computes deltas against a state vector', () => {
    const { ops } = localInsert(createDoc(), 'alice', 0, 'abcd');
    expect(opsMissingFrom(ops, { alice: 2 }).map((op) => op.id.seq)).toEqual([3, 4]);
    expect(opsMissingFrom(ops, { alice: 4 })).toEqual([]);
  });
});
