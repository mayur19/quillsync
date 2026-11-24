# ADR-0013: JSON text frames now, binary frames for op batches later

- Status: Accepted (binary frames planned QS-055)
- Date: 2026-11-24
- Tickets: QS-030, QS-055
- Related: [ADR-0005](0005-per-character-items-run-length-encoding.md), [ADR-0019](0019-zod-at-every-boundary.md)

## Context and Problem Statement

The sync protocol carries control messages (hello, welcome, ack, presence, error) and op batches. The binary codec already exists for storage. Which frame format should the WebSocket use?

## Decision Drivers

- Debuggability in browser dev tools while the protocol is evolving.
- Validation with the same zod schemas used for HTTP.
- Bandwidth for large batches (welcome deltas, offline merges).

## Considered Options

1. JSON text frames for everything, op batches as JSON runs; validated by zod in `protocol/messages.ts`.
2. Binary frames for everything (custom envelope + codec).
3. Mixed: JSON control frames, binary frames for op batches.

## Decision Outcome

Chosen option: **1 now, migrate to 3 under QS-055**. Runs in JSON are already compact because of run-length encoding, so typing traffic is small. QS-055 adds binary frames carrying codec payloads for `ops` and `welcome`, negotiated in `hello`.

### Consequences

- Good: frames are readable in dev tools and test logs; malformed frames get a precise `VALIDATION_ERROR`.
- Good: one schema language for every boundary.
- Bad: JSON escaping and per-run key names cost bandwidth on large welcome deltas; mitigated by `WS_MAX_MESSAGE_BYTES` (262144) and later QS-055.
- Bad: server re-encodes JSON runs to binary for storage; CPU cost is O(size).

## Pros and Cons of the Options

- Binary only: smallest, opaque during development, needs a separate validator layer.
- Mixed: best long-term, extra negotiation; deferred until the protocol stabilizes.
