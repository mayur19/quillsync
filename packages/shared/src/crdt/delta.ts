import { vectorCovers, type StateVector } from './ids.js';
import type { Op } from './types.js';

/**
 * Ops from `log` that a replica with `vector` has not seen yet. Deltas are
 * computed from the op log, not from document state: a delete that lost a race
 * with a concurrent delete changes nothing in the document but still occupies a
 * seq number that peers need for contiguity.
 */
export function opsMissingFrom(log: readonly Op[], vector: StateVector): Op[] {
  return log.filter((op) => !vectorCovers(vector, op.id));
}
