import { afterAll, describe, expect, it } from 'vitest';
import {
  applyOps,
  clampToLocal,
  collectGarbage,
  collectWithReplicaVectors,
  compactStable,
  materialize,
  createDoc,
  idKey,
  localDelete,
  localInsert,
  minVector,
  toText,
  type Op,
} from '../../src/index.js';
import { createRng } from '../helpers/random.js';
import { createSimulation, deliverEverything, runRandomSession } from '../helpers/sim.js';

let totalCollected = 0;

describe('tombstone garbage collection', () => {
  afterAll(() => {
    // The randomized sessions must actually exercise collection, not pass vacuously.
    expect(totalCollected).toBeGreaterThan(0);
  });

  it('collects stable childless tombstones and keeps the text', () => {
    let doc = localInsert(createDoc(), 'alice', 0, 'abcdef').doc;
    doc = localDelete(doc, 'alice', 3, 3).doc; // remove the tail "def"
    const { doc: compacted, collected } = collectGarbage(doc, doc.vector);
    expect(toText(compacted)).toBe('abc');
    // "f" is a leaf; once dropped, "e" and then "d" become leaves in the same pass.
    expect(collected).toBe(3);
    expect(compacted.items).toHaveLength(3);
    expect(compacted.index.size).toBe(3);
  });

  it('keeps tombstones that are ancestors of live text, but quiescent compaction drops them', () => {
    let doc = localInsert(createDoc(), 'alice', 0, 'abcdef').doc;
    doc = localDelete(doc, 'alice', 1, 3).doc; // remove "bcd"; "e" still hangs off "d"
    expect(collectGarbage(doc, doc.vector).collected).toBe(0);
    const { doc: compacted, collected } = compactStable(doc, doc.vector);
    expect(collected).toBe(3);
    expect(toText(compacted)).toBe('aef');
    expect(compacted.items.map((i) => i.origin?.seq ?? null)).toEqual([null, 1, 5]);
    expect(compactStable(doc, { alice: 1 }).collected).toBe(0); // not fully stable
  });

  it('keeps tombstones whose delete is not yet stable', () => {
    let doc = localInsert(createDoc(), 'alice', 0, 'abc').doc;
    doc = localDelete(doc, 'bobby', 1, 1).doc;
    const result = collectGarbage(doc, { alice: 3 });
    expect(result.collected).toBe(0);
    expect(result.doc).toBe(doc);
  });

  it('keeps a tombstone that is still the origin of a live item', () => {
    let doc = localInsert(createDoc(), 'alice', 0, 'ab').doc;
    doc = localDelete(doc, 'alice', 0, 1).doc; // "a" deleted, "b" (origin a) alive
    const result = collectGarbage(doc, doc.vector);
    expect(result.collected).toBe(0);
    expect(result.doc.items.map((i) => i.char)).toEqual(['a', 'b']);
  });

  it('does nothing while ops are pending', () => {
    const a = localInsert(createDoc(), 'alice', 0, 'ab');
    const deleted = localDelete(a.doc, 'alice', 1, 1).doc;
    const orphan: Op = {
      kind: 'insert',
      id: { client: 'carol', seq: 2 },
      lamport: 9,
      origin: null,
      char: 'q',
    };
    const withPending = applyOps(deleted, [orphan]);
    expect(withPending.pending).toHaveLength(1);
    expect(collectGarbage(withPending, withPending.vector).collected).toBe(0);
  });

  it('clamps the frontier to locally delivered ops', () => {
    expect(clampToLocal({ a: 5, b: 2 }, { a: 3 })).toEqual({ a: 3 });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'seed %i: a collected replica still converges with uncollected ones',
    (seed) => {
      const rng = createRng(seed * 104729);
      const sim = createSimulation(3);
      runRandomSession(rng, sim, 120);
      for (const replica of sim.replicas) deliverEverything(rng, replica, sim.log);

      // Every replica has delivered everything: the frontier is the common vector.
      const stable = minVector(sim.replicas.map((r) => r.doc.vector));
      const [collector] = sim.replicas;
      const before = toText(collector!.doc);
      const result = collectWithReplicaVectors(
        collector!.doc,
        sim.replicas.map((r) => r.doc.vector),
      );
      totalCollected += result.collected;
      collector!.doc = result.doc;
      expect(toText(collector!.doc)).toBe(before);
      expect(collectGarbage(collector!.doc, stable).collected).toBe(0); // idempotent

      runRandomSession(rng, sim, 120);
      for (const replica of sim.replicas) deliverEverything(rng, replica, sim.log);
      const texts = sim.replicas.map((r) => toText(r.doc));
      expect(new Set(texts).size).toBe(1);
      const visibleOrders = sim.replicas.map((r) =>
        r.doc.items
          .filter((i) => i.deletedBy === null)
          .map((i) => idKey(i.id))
          .join(','),
      );
      expect(new Set(visibleOrders).size).toBe(1);
    },
  );

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'seed %i: a quiescently compacted replica converges with uncompacted ones',
    (seed) => {
      const rng = createRng(seed * 7727);
      const sim = createSimulation(3);
      runRandomSession(rng, sim, 120);
      for (const replica of sim.replicas) deliverEverything(rng, replica, sim.log);
      const stable = minVector(sim.replicas.map((r) => r.doc.vector));
      const [compactor] = sim.replicas;
      const before = toText(compactor!.doc);
      compactor!.doc = compactStable(compactor!.doc, stable).doc;
      expect(compactor!.doc.items.every((i) => i.deletedBy === null)).toBe(true);
      expect(toText(compactor!.doc)).toBe(before);

      runRandomSession(rng, sim, 150);
      for (const replica of sim.replicas) deliverEverything(rng, replica, sim.log);
      expect(new Set(sim.replicas.map((r) => toText(r.doc))).size).toBe(1);
      // The re-chained tree still materializes to the same order.
      const ids = (items: readonly { id: { client: string; seq: number } }[]) =>
        items.map((i) => idKey(i.id));
      expect(ids(materialize(compactor!.doc.items))).toEqual(ids(compactor!.doc.items));
    },
  );
});
