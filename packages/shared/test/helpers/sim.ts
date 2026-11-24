import {
  applyOps,
  createDoc,
  localDelete,
  localInsert,
  vectorCovers,
  visibleLength,
  type DocState,
  type Op,
} from '../../src/index.js';
import { randomText, type Rng } from './random.js';

export interface Replica {
  readonly client: string;
  doc: DocState;
}

export interface Simulation {
  readonly replicas: Replica[];
  /** Every op ever produced, in creation order (the "network"). */
  readonly log: Op[];
}

export function createSimulation(count: number): Simulation {
  return {
    replicas: Array.from({ length: count }, (_, i) => ({
      client: `replica${i}`,
      doc: createDoc(),
    })),
    log: [],
  };
}

export function randomLocalEdit(rng: Rng, replica: Replica, log: Op[]): void {
  const length = visibleLength(replica.doc);
  if (length > 0 && rng.chance(0.35)) {
    const index = rng.int(length);
    const count = 1 + rng.int(Math.min(4, length - index));
    const change = localDelete(replica.doc, replica.client, index, count);
    replica.doc = change.doc;
    log.push(...change.ops);
  } else {
    const change = localInsert(replica.doc, replica.client, rng.int(length + 1), randomText(rng));
    replica.doc = change.doc;
    log.push(...change.ops);
  }
}

/** Delivers a random, shuffled, possibly duplicated subset of unseen ops. */
export function randomDelivery(rng: Rng, replica: Replica, log: readonly Op[]): void {
  const unseen = log.filter((op) => !vectorCovers(replica.doc.vector, op.id));
  const subset = unseen.filter(() => rng.chance(0.5));
  const withDuplicates = [...subset, ...subset.filter(() => rng.chance(0.2))];
  replica.doc = applyOps(replica.doc, rng.shuffle(withDuplicates));
}

export function deliverEverything(rng: Rng, replica: Replica, log: readonly Op[]): void {
  const shuffled = rng.shuffle(log);
  // Deliver in random chunk sizes so both scan and tree merge paths are exercised.
  let offset = 0;
  while (offset < shuffled.length) {
    const size = 1 + rng.int(rng.chance(0.5) ? 8 : 80);
    replica.doc = applyOps(replica.doc, shuffled.slice(offset, offset + size));
    offset += size;
  }
}

export function runRandomSession(rng: Rng, sim: Simulation, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    const replica = rng.pick(sim.replicas);
    if (rng.chance(0.65)) randomLocalEdit(rng, replica, sim.log);
    else randomDelivery(rng, replica, sim.log);
  }
}
