/**
 * Identifiers, Lamport stamps and state vectors for the sequence CRDT.
 *
 * Every operation is identified by `(client, seq)` where `seq` is contiguous per
 * client (1, 2, 3, ...). That contiguity is what makes a state vector a complete
 * summary of what a replica has seen. Ordering between concurrent items uses a
 * separate Lamport timestamp, tie-broken by client id.
 */

export interface ItemId {
  readonly client: string;
  readonly seq: number;
}

/** client id -> highest contiguous seq delivered from that client. */
export type StateVector = Readonly<Record<string, number>>;

/** Client ids: 4-32 chars, alphanumeric first char (rules out `__proto__`). */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{3,31}$/;

export function idKey(id: ItemId): string {
  return `${id.seq}@${id.client}`;
}

export function sameId(a: ItemId | null, b: ItemId | null): boolean {
  if (a === null || b === null) return a === b;
  return a.client === b.client && a.seq === b.seq;
}

/**
 * Total order on (lamport, client). Returns > 0 when `a` sorts after `b` in the
 * RGA sense, i.e. `a` "wins" and is placed closer to the shared origin.
 */
export function compareStamps(
  aLamport: number,
  aClient: string,
  bLamport: number,
  bClient: string,
): number {
  if (aLamport !== bLamport) return aLamport - bLamport;
  if (aClient === bClient) return 0;
  return aClient < bClient ? -1 : 1;
}

export function vectorGet(vector: StateVector, client: string): number {
  return Object.hasOwn(vector, client) ? (vector[client] ?? 0) : 0;
}

export function vectorCovers(vector: StateVector, id: ItemId): boolean {
  return vectorGet(vector, id.client) >= id.seq;
}

export function vectorSet(vector: StateVector, client: string, seq: number): StateVector {
  return { ...vector, [client]: seq };
}

/** Pointwise maximum. */
export function mergeVectors(a: StateVector, b: StateVector): StateVector {
  const result: Record<string, number> = { ...a };
  for (const [client, seq] of Object.entries(b)) {
    result[client] = Math.max(vectorGet(a, client), seq);
  }
  return result;
}

/** Pointwise minimum over the union of clients; a missing entry counts as 0. */
export function minVector(vectors: readonly StateVector[]): StateVector {
  if (vectors.length === 0) return {};
  const clients = new Set(vectors.flatMap((v) => Object.keys(v)));
  const result: Record<string, number> = {};
  for (const client of clients) {
    const min = Math.min(...vectors.map((v) => vectorGet(v, client)));
    if (min > 0) result[client] = min;
  }
  return result;
}

/** True when `a` has seen everything `b` has seen. */
export function vectorDominates(a: StateVector, b: StateVector): boolean {
  return Object.entries(b).every(([client, seq]) => vectorGet(a, client) >= seq);
}
