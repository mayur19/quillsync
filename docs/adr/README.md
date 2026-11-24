# Architecture decision records

Decisions are recorded in [MADR](https://adr.github.io/madr/) format: context and problem statement, decision drivers, considered options, decision outcome with positive and negative consequences, and pros and cons of the rejected options. Records are immutable once accepted; a changed decision gets a new record that supersedes the old one, and the old record's status is updated to point at it.

Domain decisions about the CRDT and sync engine are numbered 0003-0016 and 0021; platform decisions are 0001-0002 and 0017-0020.

| ADR                                                             | Title                                                                                          | Status                           | Area               | Tickets                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------- | ------------------ | ------------------------------ |
| [0001](0001-modular-monolith-npm-workspaces.md)                 | Modular monolith in npm workspaces                                                             | Accepted                         | Platform           | QS-001                         |
| [0002](0002-fastify-5-http-and-websocket.md)                    | Fastify 5 for HTTP and WebSocket                                                               | Accepted                         | Platform           | QS-003, QS-030                 |
| [0003](0003-in-house-crdt-instead-of-libraries.md)              | In-house sequence CRDT instead of an external CRDT library                                     | Accepted                         | CRDT               | QS-020..027                    |
| [0004](0004-rga-over-yata-logoot-lseq-ot.md)                    | RGA as the sequence algorithm (over YATA, Logoot/LSEQ and OT)                                  | Accepted                         | CRDT               | QS-021, QS-023                 |
| [0005](0005-per-character-items-run-length-encoding.md)         | Per-character items in memory, run-length encoding on the wire and in storage                  | Accepted                         | CRDT / encoding    | QS-021, QS-024                 |
| [0006](0006-lamport-timestamps-contiguous-ids-state-vectors.md) | Lamport timestamps with contiguous (client, seq) ids and state vectors                         | Accepted                         | CRDT               | QS-020, QS-022                 |
| [0007](0007-origin-nearest-visible-left-neighbour.md)           | Insert origin is the nearest visible left neighbour                                            | Accepted                         | CRDT               | QS-021, QS-025                 |
| [0008](0008-causal-readiness-buffer-at-replica.md)              | Causal readiness buffer at the replica instead of relying on transport ordering                | Accepted                         | CRDT / sync        | QS-022                         |
| [0009](0009-tombstone-gc-causal-stability-childless.md)         | Tombstone GC only under causal stability: incremental childless rule plus quiescent compaction | Accepted (server wiring planned) | CRDT / persistence | QS-025, QS-062, QS-063         |
| [0010](0010-tree-materialization-for-batch-merge.md)            | Timestamp-tree materialization for batch merge, scan for incremental ops                       | Accepted                         | CRDT               | QS-023, QS-043                 |
| [0011](0011-op-log-postgres-bytea-batches.md)                   | Op log in PostgreSQL as bytea batches; snapshots and compaction planned                        | Accepted                         | Persistence        | QS-031, QS-060, QS-061         |
| [0012](0012-single-process-authoritative-rooms.md)              | Single-process authoritative rooms with a per-room serialized queue                            | Accepted (multi-node planned)    | Sync               | QS-030, QS-053, QS-054         |
| [0013](0013-json-text-frames-now-binary-later.md)               | JSON text frames now, binary frames for op batches later                                       | Accepted                         | Sync protocol      | QS-030, QS-055                 |
| [0014](0014-anchors-as-item-ids.md)                             | Anchors (cursors, comments) as CRDT ItemIds                                                    | Accepted                         | CRDT / UX          | QS-026, QS-032, QS-080, QS-081 |
| [0015](0015-immutable-crdt-api-copy-on-write.md)                | Immutable CRDT API with copy-on-write                                                          | Accepted                         | CRDT               | QS-020..026                    |
| [0016](0016-textarea-diff-editor-before-contenteditable.md)     | Textarea with prefix/suffix diff before a contenteditable rich-text surface                    | Accepted                         | Editor             | QS-035, QS-050                 |
| [0017](0017-postgres-sessions-scrypt-csrf-double-submit.md)     | Postgres-backed sessions, scrypt password hashing, CSRF double submit                          | Accepted                         | Security           | QS-008..010                    |
| [0018](0018-plain-sql-forward-only-migrations.md)               | Plain SQL, forward-only migrations with checksum verification                                  | Accepted                         | Persistence        | QS-005                         |
| [0019](0019-zod-at-every-boundary.md)                           | zod validation at every boundary                                                               | Accepted                         | Platform           | QS-002, QS-003, QS-030         |
| [0020](0020-no-containers-native-postgres.md)                   | No containers; native PostgreSQL locally and in CI                                             | Accepted                         | Operations         | QS-006, QS-007                 |
| [0021](0021-persist-before-ack-at-least-once.md)                | Persist before ack, at-least-once delivery with dedupe                                         | Accepted                         | Sync / persistence | QS-031, QS-036                 |

## Template

```markdown
# ADR-NNNN: Title

- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD
- Tickets: QS-xxx
- Related: links

## Context and Problem Statement

## Decision Drivers

## Considered Options

## Decision Outcome

### Consequences

## Pros and Cons of the Options
```
