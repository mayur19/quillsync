import { describe, expect, it } from 'vitest';
import { docFromOps, idKey, materialize, toText, type DocState } from '../../src/index.js';
import { createRng } from '../helpers/random.js';
import { createSimulation, deliverEverything, runRandomSession } from '../helpers/sim.js';

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

function order(doc: DocState): string[] {
  return doc.items.map((item) => idKey(item.id));
}

describe('convergence under random concurrent editing', () => {
  it.each(SEEDS)('seed %i: all replicas converge after full delivery', (seed) => {
    const rng = createRng(seed);
    const sim = createSimulation(2 + rng.int(4));
    runRandomSession(rng, sim, 60 + rng.int(120));
    for (const replica of sim.replicas) deliverEverything(rng, replica, sim.log);

    const [first, ...rest] = sim.replicas;
    for (const replica of rest) {
      expect(replica.doc.pending).toHaveLength(0);
      expect(order(replica.doc)).toEqual(order(first!.doc));
      expect(toText(replica.doc)).toBe(toText(first!.doc));
    }
  });

  it.each(SEEDS.slice(0, 40))(
    'seed %i: incremental scan order equals tree materialization',
    (seed) => {
      const rng = createRng(seed * 7919);
      const sim = createSimulation(3);
      runRandomSession(rng, sim, 150);
      for (const replica of sim.replicas) deliverEverything(rng, replica, sim.log);

      const fresh = docFromOps(rng.shuffle(sim.log));
      for (const replica of sim.replicas) {
        expect(order(replica.doc)).toEqual(order(fresh));
        expect(materialize(replica.doc.items).map((item) => idKey(item.id))).toEqual(order(fresh));
      }
    },
  );

  it('is independent of delivery order and duplication for a single replica', () => {
    const rng = createRng(4242);
    const sim = createSimulation(4);
    runRandomSession(rng, sim, 300);
    const texts = new Set(
      Array.from({ length: 10 }, () => toText(docFromOps(rng.shuffle([...sim.log, ...sim.log])))),
    );
    expect(texts.size).toBe(1);
  });
});
