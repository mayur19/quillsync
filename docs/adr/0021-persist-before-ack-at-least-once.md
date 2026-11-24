# ADR-0021: Persist before ack, at-least-once delivery with dedupe

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-031, QS-036, QS-120
- Related: [ADR-0008](0008-causal-readiness-buffer-at-replica.md), [ADR-0011](0011-op-log-postgres-bytea-batches.md), [ADR-0012](0012-single-process-authoritative-rooms.md)

## Context and Problem Statement

A client must know when its local ops are durable so it can drop them from its outbound queue. What does `ack` promise, and what happens on failure?

## Decision Drivers

- No acknowledged op is ever lost (QA-DUR-1).
- Clients may resend freely after any doubt.
- Fan-out should not expose ops that might be lost.

## Considered Options

1. Room integrates into a candidate state, inserts the batch row, and only after commit sends `ack {vector}` to the sender and `ops` to peers; clients resend everything the server vector does not cover after reconnect; the server drops seen ops by vector and the unique constraint.
2. Ack on receipt, persist asynchronously.
3. Fan out immediately, persist and ack later.

## Decision Outcome

Chosen option: **1**. The client's outbound queue keeps each local op until an `ack` vector covers it. On reconnect the client sends `hello {vector}`; from `welcome.vector` it learns which of its ops the server lacks and resends them.

### Consequences

- Good: an ack is a durability receipt; peers never see an op that could disappear.
- Good: delivery is at-least-once end to end; duplicates are harmless.
- Bad: persistence latency is on the propagation path (QA-LAT-2 budget).
- Bad: if the insert fails the room does not commit the candidate state; the sender gets `error {code: INTERNAL}` and keeps its ops queued.
- Bad: ops queued in a closed tab are lost until IndexedDB persistence (QS-120).

## Pros and Cons of the Options

- Ack on receipt: lower latency, loses acked ops on crash.
- Fan-out first: lowest latency, peers may integrate ops the server later loses, creating divergent histories that only resolve when the original client resends.
