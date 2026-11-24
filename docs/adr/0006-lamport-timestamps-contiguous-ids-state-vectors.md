# ADR-0006: Lamport timestamps with contiguous (client, seq) ids and state vectors

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-020, QS-022
- Related: [ADR-0008](0008-causal-readiness-buffer-at-replica.md), [ADR-0009](0009-tombstone-gc-causal-stability-childless.md)

## Context and Problem Statement

Each op needs (a) a globally unique identity, (b) an ordering key for concurrent inserts, and (c) a compact way to express "which ops have I seen" for delta sync and GC.

## Decision Drivers

- Delta sync in one message without enumerating op ids.
- Deterministic tie-breaking for concurrent inserts.
- Idempotent delivery: detecting "already seen" in O(1).
- Compact encoding (varints).

## Considered Options

1. Id = `{client, seq}` with seq contiguous per client (1, 2, 3, ...), plus a Lamport timestamp per op; ordering key = (lamport, client); state vector = map client → highest contiguous seq.
2. Id = (lamport, client) only; seen-set as a version vector over lamport values.
3. Random UUID per op with hybrid logical clock ordering and Bloom-filter sync.
4. Full vector clock per op.

## Decision Outcome

Chosen option: **1**. Client ids are random strings per editor tab (one tab = one replica). `seq` is contiguous per client, so a state vector entry `v[c] = n` means "all ops c:1..c:n are integrated", and `seq <= v[c]` means "seen, drop". The Lamport clock advances to `max(local, received) + 1` on each local op and gives the RGA ordering key `(lamport, client)` compared lexicographically.

### Consequences

- Good: delta sync = ops with `seq > remote[c]` for each client; `welcome` carries exactly the missing ops.
- Good: duplicate detection is a single map lookup; delivery becomes idempotent.
- Good: Lamport strictly increases along causal chains, which is the property both the scan-stop proof and the GC proof rely on (a child's lamport exceeds its origin's; any op created after seeing a delete has a larger lamport than its target).
- Good: run compression exploits consecutive seq and lamport.
- Bad: a new client id per tab grows state vectors with the number of tabs that ever edited. Mitigated later by stale replica eviction and resync from snapshot (QS-063); vectors are varint-encoded.
- Bad: contiguity requires the causal buffer to hold out-of-order ops from one client ([ADR-0008](0008-causal-readiness-buffer-at-replica.md)).

## Pros and Cons of the Options

- (lamport, client) as id: no separate seq, but "have I seen it" needs a set, not a vector entry.
- UUID + HLC: no coordination, but no compact summary of seen ops.
- Vector clock per op: exact causality, but O(replicas) metadata per character.
