# ADR-0005: Per-character items in memory, run-length encoding on the wire and in storage

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-021, QS-024
- Related: [ADR-0011](0011-op-log-postgres-bytea-batches.md), [ADR-0013](0013-json-text-frames-now-binary-later.md), [system-design section 4.4](../design/system-design.md#44-run-length-compression)

## Context and Problem Statement

A sequence CRDT can model the document as one item per character or as items that span runs of text which are split on concurrent insert. Which granularity do we use in memory, on the wire and on disk?

## Decision Drivers

- Simplicity of the integration and GC proofs.
- Network and storage size: typing is bursty and sequential, so most ops are adjacent inserts from one client.
- Stable per-character identity for anchors (cursors, comments).
- Ability to split and merge without changing identities.

## Considered Options

1. One item per character (code point) in memory; compress runs only when encoding.
2. Run items in memory (Yjs style) that split on demand.
3. One item per character everywhere, no compression.

## Decision Outcome

Chosen option: **1**. In memory each code point is an item `{id: {client, seq}, lamport, origin, char, deleted}`. `runs.ts` compresses consecutive inserts from one client whose seq and lamport increase by one and whose origin is the previous character into one run `{client, seq, lamport, origin, text}`; consecutive deletes collapse into one run with target ranges. `codec.ts` encodes runs with LEB128 varints and a client-id dictionary.

### Consequences

- Good: integration, GC and anchor code reasons about single characters only; no split logic.
- Good: a typed paragraph of 1 000 characters is one run of roughly 1 KB, so wire and storage size are near plain text (QA-WIRE-1).
- Good: run boundaries are reconstructed deterministically; expanding then compressing is lossless (`runs.test.ts`).
- Bad: memory is per character (object per item). Target <= 256 bytes per item (QA-MEM-1); QS-043 may introduce a packed representation.
- Bad: run compression is greedy; interleaved typing from two clients produces short runs. Acceptable: the op log is still bounded by snapshots (QS-060/061).

## Pros and Cons of the Options

- Run items in memory: much lower memory, but every integration may split items and every proof must account for splits.
- No compression: simplest, but a 1 000-character paragraph would cost tens of KB in JSON and in `document_ops`.
