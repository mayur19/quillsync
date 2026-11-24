# ADR-0008: Causal readiness buffer at the replica instead of relying on transport ordering

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-022
- Related: [ADR-0006](0006-lamport-timestamps-contiguous-ids-state-vectors.md), [ADR-0021](0021-persist-before-ack-at-least-once.md), [system-design section 4.3](../design/system-design.md#43-causal-readiness-buffer)

## Context and Problem Statement

RGA requires an insert's origin to exist before it is integrated and a delete's target to exist before it is applied. A single WebSocket delivers in order, but ops reach a replica through several paths: `welcome` deltas, live fan-out, resends after reconnect, planned multi-node NOTIFY relays (QS-053), IndexedDB replay (QS-120) and snapshot + tail rehydration (QS-060). Where is causal order enforced?

## Decision Drivers

- Correctness must not depend on any single transport preserving order or delivering exactly once.
- Resends after reconnect deliberately duplicate ops.
- Multi-node fan-out may reorder batches.

## Considered Options

1. Replica-side causal buffer: an op is ready iff `id.seq == vector[client] + 1` and its origin (insert) or target (delete) is present; otherwise it waits; ops with `seq <= vector[client]` are dropped.
2. Rely on server-sequenced, in-order, exactly-once delivery (TCP + server order).
3. Vector clock per op with full causal broadcast middleware.

## Decision Outcome

Chosen option: **1**. `document.ts` keeps a pending buffer keyed by the missing dependency; integrating an op wakes the ops waiting on it. The same code runs on the server room and every client replica.

### Consequences

- Good: delivery is idempotent and order-insensitive; at-least-once transports suffice.
- Good: the property harness can shuffle and duplicate messages freely, which is how convergence is tested.
- Good: multi-node fan-out (QS-053) needs no ordering guarantees from LISTEN/NOTIFY.
- Bad: a lost op causes its dependants to wait indefinitely. Recovery is the reconnect handshake: `hello` carries the vector and the server resends what is missing.
- Bad: the buffer is unbounded in the library; per-connection bounds and backpressure arrive with QS-052.

## Pros and Cons of the Options

- Transport ordering: zero code, but breaks on the first reconnect resend or multi-node relay.
- Per-op vector clocks: precise, but O(replicas) metadata per op; contiguous per-client seq plus origin/target presence already captures the dependencies RGA needs.
