import type { ItemId, StateVector } from './ids.js';

/** One character of the replicated sequence. Deleted items stay as tombstones. */
export interface Item {
  readonly id: ItemId;
  readonly lamport: number;
  /** Visible left neighbour when the item was created; null = document start. */
  readonly origin: ItemId | null;
  /** A single Unicode code point. */
  readonly char: string;
  /** Id of the delete op that tombstoned this item, or null when visible. */
  readonly deletedBy: ItemId | null;
}

export interface InsertOp {
  readonly kind: 'insert';
  readonly id: ItemId;
  readonly lamport: number;
  readonly origin: ItemId | null;
  readonly char: string;
}

export interface DeleteOp {
  readonly kind: 'delete';
  readonly id: ItemId;
  readonly lamport: number;
  readonly target: ItemId;
}

export type Op = InsertOp | DeleteOp;

/**
 * Immutable replica state. Every function in this module returns a new DocState
 * and never mutates its input.
 */
export interface DocState {
  /** Items in document order, tombstones included. */
  readonly items: readonly Item[];
  /** idKey -> item, for O(1) existence checks. */
  readonly index: ReadonlyMap<string, Item>;
  readonly vector: StateVector;
  /** client -> Lamport timestamp of its latest delivered op (must strictly increase). */
  readonly clocks: Readonly<Record<string, number>>;
  /** Highest Lamport timestamp observed. */
  readonly lamport: number;
  /** Remote ops whose causal dependencies have not arrived yet. */
  readonly pending: readonly Op[];
}

export class CrdtError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_OP' | 'CAUSALITY_VIOLATION' | 'OUT_OF_RANGE',
  ) {
    super(message);
    this.name = 'CrdtError';
  }
}
