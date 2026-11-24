# Backlog

Every ticket in the quillsync plan. This file is the single source of truth for estimates; [implementation-status.md](implementation-status.md) derives its percentages from it and [roadmap.md](roadmap.md) groups it into milestones.

- **Estimate** is in engineering hours and includes tests and documentation updates.
- **Status** is `done` (merged, tested, running in CI) or `pending` (not started; any API surface returns `501 NOT_IMPLEMENTED` with the ticket ID in `error.details.ticket`).
- **Depends** lists tickets that must land first.

## Epics

| Epic | Name                               | Scope                                                                   |
| ---- | ---------------------------------- | ----------------------------------------------------------------------- |
| E0   | Foundation                         | Tooling, config, logging, error envelope, migrations, launcher, CI      |
| E1   | Identity & access                  | Registration, sessions, CSRF, RBAC, invitations, password reset, audit  |
| E2   | CRDT core                          | Sequence CRDT, causal delivery, encoding, GC, rich text and block model |
| E3   | Real-time sync                     | WebSocket protocol, rooms, presence, editor surface, horizontal fan-out |
| E4   | Persistence & compaction           | Op log, snapshots, compaction, GC frontier, backups                     |
| E5   | Version history                    | Checkpoints, named versions, diff, restore                              |
| E6   | Comments, mentions & notifications | Anchored threads, mentions, notification center                         |
| E7   | Workspace, folders & sharing       | Folder tree, per-document permissions, link sharing                     |
| E8   | Search                             | tsvector projection, ranking, permission-aware filtering                |
| E9   | Import & export                    | Markdown/HTML export, Markdown import, job queue                        |
| E10  | Offline                            | IndexedDB persistence, offline UX, app shell                            |
| E11  | Operations & hardening             | Metrics, load tests, security gates, accessibility, deployment          |

## Tickets

| ID     | Title                                                                            | Epic | Milestone | Est (h) | Status  | Depends        |
| ------ | -------------------------------------------------------------------------------- | ---- | --------- | ------: | ------- | -------------- |
| QS-001 | npm workspaces monorepo, strict TypeScript, ESLint, Prettier                     | E0   | M0        |       6 | done    | —              |
| QS-002 | Zod-validated config loader and pino structured logging                          | E0   | M0        |       4 | done    | QS-001         |
| QS-003 | JSON response envelope, central error handler, request IDs                       | E0   | M0        |       4 | done    | QS-002         |
| QS-004 | Health and readiness endpoints                                                   | E0   | M0        |       2 | done    | QS-003         |
| QS-005 | Forward-only SQL migration runner with checksum verification                     | E0   | M0        |       5 | done    | QS-002         |
| QS-006 | `run.sh` launcher, `.env` bootstrap and seed pipeline                            | E0   | M0        |       5 | done    | QS-005         |
| QS-007 | CI pipeline on native runner PostgreSQL                                          | E0   | M0        |       3 | done    | QS-005         |
| QS-008 | Organization-owner registration with scrypt password hashing                     | E1   | M0        |       5 | done    | QS-005         |
| QS-009 | Postgres-backed sessions; login, logout, me                                      | E1   | M0        |       5 | done    | QS-008         |
| QS-010 | CSRF double-submit token and login rate limiting                                 | E1   | M0        |       4 | done    | QS-009         |
| QS-011 | RBAC permission matrix (owner/editor/commenter/viewer)                           | E1   | M0        |       3 | done    | QS-009         |
| QS-012 | Audit log write path                                                             | E1   | M0        |       3 | done    | QS-009         |
| QS-013 | Pending endpoint registry returning 501 with ticket IDs                          | E0   | M0        |       2 | done    | QS-003         |
| QS-014 | Member invitations through the local outbox, accept flow                         | E1   | M4        |      12 | pending | QS-011         |
| QS-015 | Password reset through the local outbox                                          | E1   | M4        |       8 | pending | QS-009         |
| QS-016 | Session management: list and revoke sessions, idle timeout                       | E1   | M4        |       8 | pending | QS-009         |
| QS-017 | Member listing, role changes and removal                                         | E1   | M4        |       6 | pending | QS-011         |
| QS-018 | Account settings and password change                                             | E1   | M4        |       6 | pending | QS-009         |
| QS-019 | Audit log query API and admin screen                                             | E1   | M8        |      10 | pending | QS-012         |
| QS-140 | Email-verified signup through the local outbox (activation link, no enumeration) | E1   | M4        |      12 | pending | QS-008         |
| QS-020 | CRDT identifiers, Lamport clocks and state vectors                               | E2   | M1        |       4 | done    | QS-001         |
| QS-021 | RGA integration: insert, delete, tombstones                                      | E2   | M1        |       8 | done    | QS-020         |
| QS-022 | Causal readiness buffer and idempotent delivery                                  | E2   | M1        |       5 | done    | QS-021         |
| QS-023 | Timestamp-tree materialization for batch merge                                   | E2   | M1        |       5 | done    | QS-021         |
| QS-024 | Run-length op compression and binary varint codec                                | E2   | M1        |       6 | done    | QS-021         |
| QS-025 | Causal-stability tombstone garbage collection (library)                          | E2   | M1        |       5 | done    | QS-022         |
| QS-026 | Position anchors and text diffing                                                | E2   | M1        |       3 | done    | QS-021         |
| QS-027 | Seeded convergence property-test harness                                         | E2   | M1        |       6 | done    | QS-022         |
| QS-030 | WebSocket sync protocol and in-memory room registry                              | E3   | M1        |       8 | done    | QS-022, QS-009 |
| QS-031 | Durable op log persistence and room rehydration                                  | E3   | M1        |       5 | done    | QS-030, QS-024 |
| QS-032 | Presence broadcasting with CRDT cursor anchors                                   | E3   | M1        |       3 | done    | QS-030, QS-026 |
| QS-033 | Document list, create and read endpoints                                         | E3   | M1        |       3 | done    | QS-011         |
| QS-034 | Web shell: login, register, layout, planned navigation                           | E3   | M1        |       5 | done    | QS-009         |
| QS-035 | Plain-text collaborative editor with remote carets                               | E3   | M1        |       8 | done    | QS-030, QS-034 |
| QS-036 | Reconnect with backoff and resend of unacknowledged ops                          | E3   | M1        |       3 | done    | QS-035         |
| QS-040 | Rich-text formatting marks (bold, italic, code, link) as CRDT attributes         | E2   | M3        |      32 | pending | QS-021         |
| QS-041 | Block model (headings, lists, quotes, code blocks) on the sequence CRDT          | E2   | M3        |      48 | pending | QS-040         |
| QS-042 | Block move/reorder operation with conflict resolution                            | E2   | M3        |      24 | pending | QS-041         |
| QS-043 | Indexed sequence structure (order-statistic B-tree) for O(log n) integration     | E2   | M8        |      40 | pending | QS-023         |
| QS-044 | Per-user selective undo/redo                                                     | E2   | M3        |      24 | pending | QS-040         |
| QS-045 | Large-scale fuzzing and benchmark harness                                        | E2   | M8        |      12 | pending | QS-027         |
| QS-046 | Table blocks                                                                     | E2   | M3        |      32 | pending | QS-041         |
| QS-047 | Image embeds stored on local disk                                                | E2   | M3        |      20 | pending | QS-041         |
| QS-050 | Rich-text editor surface (contenteditable, IME, selection mapping)               | E3   | M3        |      56 | pending | QS-040, QS-035 |
| QS-051 | Awareness extensions: selection ranges, idle state, follow mode                  | E3   | M3        |       8 | pending | QS-032         |
| QS-052 | Backpressure and per-connection op rate limiting                                 | E3   | M8        |      10 | pending | QS-030         |
| QS-053 | Multi-node fan-out through Postgres LISTEN/NOTIFY                                | E3   | M8        |      32 | pending | QS-031         |
| QS-054 | Sticky room ownership with advisory locks and failover                           | E3   | M8        |      24 | pending | QS-053         |
| QS-055 | Binary WebSocket frames for op batches                                           | E3   | M8        |       6 | pending | QS-024         |
| QS-056 | Re-authorization and permission revocation on live sockets                       | E3   | M4        |       8 | pending | QS-092         |
| QS-057 | Presence scaling for 100+ concurrent editors (throttling, sampling)              | E3   | M8        |      12 | pending | QS-032         |
| QS-060 | Periodic document snapshots to Postgres                                          | E4   | M2        |      16 | pending | QS-031         |
| QS-061 | Op-log compaction behind the latest snapshot                                     | E4   | M2        |      12 | pending | QS-060         |
| QS-062 | Replica acknowledgement tracking and server-side GC frontier                     | E4   | M2        |      16 | pending | QS-025, QS-060 |
| QS-063 | Stale replica eviction and resync from snapshot                                  | E4   | M2        |      10 | pending | QS-062         |
| QS-064 | Backup and restore verification tooling (pg_dump round trip)                     | E4   | M2        |       6 | pending | QS-060         |
| QS-070 | Automatic version checkpoints                                                    | E5   | M5        |      12 | pending | QS-060         |
| QS-071 | Named versions API                                                               | E5   | M5        |       8 | pending | QS-070         |
| QS-072 | Version diff computation and view                                                | E5   | M5        |      20 | pending | QS-071         |
| QS-073 | Restore a version as forward CRDT operations                                     | E5   | M5        |      16 | pending | QS-071         |
| QS-074 | Version history UI                                                               | E5   | M5        |      16 | pending | QS-072         |
| QS-075 | Version retention policies                                                       | E5   | M5        |       6 | pending | QS-070         |
| QS-080 | Comment threads anchored to CRDT ranges                                          | E6   | M6        |      20 | pending | QS-026         |
| QS-081 | Anchor stability across deletes, GC and version restore                          | E6   | M6        |      12 | pending | QS-080, QS-062 |
| QS-082 | Resolve/reopen comments and comment sidebar UI                                   | E6   | M6        |      16 | pending | QS-080         |
| QS-083 | Mention parsing and in-app notifications                                         | E6   | M6        |      16 | pending | QS-080         |
| QS-084 | Notification center and read state                                               | E6   | M6        |      10 | pending | QS-083         |
| QS-085 | Notification digests written to the local outbox                                 | E6   | M6        |       8 | pending | QS-084         |
| QS-086 | Comment reactions                                                                | E6   | M6        |       6 | pending | QS-080         |
| QS-090 | Folder hierarchy: create, rename, move, delete                                   | E7   | M4        |      16 | pending | QS-033         |
| QS-091 | Document rename, archive, trash and permanent delete                             | E7   | M4        |      10 | pending | QS-033         |
| QS-092 | Per-document permissions with folder inheritance                                 | E7   | M4        |      20 | pending | QS-090         |
| QS-093 | Link sharing with role and expiry                                                | E7   | M4        |      12 | pending | QS-092         |
| QS-094 | Workspace switcher and multi-organization membership                             | E7   | M4        |      10 | pending | QS-017         |
| QS-095 | Document templates                                                               | E7   | M7        |      10 | pending | QS-041         |
| QS-096 | Workspace activity feed                                                          | E7   | M6        |      12 | pending | QS-012         |
| QS-100 | Plain-text projection and tsvector indexing pipeline                             | E8   | M7        |      14 | pending | QS-060         |
| QS-101 | Search API with ranking and highlighted snippets                                 | E8   | M7        |      12 | pending | QS-100         |
| QS-102 | Permission-aware search filtering                                                | E8   | M7        |       8 | pending | QS-101, QS-092 |
| QS-103 | Search UI with keyboard navigation                                               | E8   | M7        |      10 | pending | QS-101         |
| QS-104 | Search across comment bodies                                                     | E8   | M7        |       8 | pending | QS-101, QS-080 |
| QS-110 | Markdown export                                                                  | E9   | M7        |      10 | pending | QS-041         |
| QS-111 | Sanitized HTML export                                                            | E9   | M7        |       8 | pending | QS-110         |
| QS-112 | Markdown import into CRDT operations                                             | E9   | M7        |      16 | pending | QS-041         |
| QS-113 | Export job queue with local-disk downloads                                       | E9   | M7        |      10 | pending | QS-110         |
| QS-114 | Bulk workspace export archive                                                    | E9   | M7        |      12 | pending | QS-113         |
| QS-120 | IndexedDB persistence of document state and pending ops                          | E10  | M8        |      16 | pending | QS-036         |
| QS-121 | Offline status UX and merge-on-reconnect indicators                              | E10  | M8        |      10 | pending | QS-120         |
| QS-122 | Service worker app shell                                                         | E10  | M8        |       8 | pending | QS-120         |
| QS-130 | Metrics endpoint in Prometheus text format                                       | E11  | M8        |       8 | pending | QS-030         |
| QS-131 | Load-testing harness for the sync server                                         | E11  | M8        |      16 | pending | QS-030         |
| QS-132 | Content Security Policy, security headers and dependency audit gate              | E11  | M8        |       6 | pending | QS-007         |
| QS-133 | Editor accessibility audit and fixes                                             | E11  | M8        |      12 | pending | QS-050         |
| QS-134 | Multi-browser collaboration E2E suite                                            | E11  | M8        |      16 | pending | QS-035         |
| QS-135 | Data retention and organization deletion                                         | E11  | M8        |      10 | pending | QS-091         |
| QS-136 | Admin console: usage and storage                                                 | E11  | M8        |      16 | pending | QS-019         |
| QS-137 | systemd/nginx deployment scripts and TLS hardening                               | E11  | M8        |       8 | pending | QS-007         |
| QS-138 | Responsive editor layout for small screens                                       | E11  | M8        |      16 | pending | QS-050         |
| QS-139 | Internationalization of the web client                                           | E11  | M8        |      12 | pending | QS-034         |

## Totals

| Status    | Tickets |    Hours |
| --------- | ------: | -------: |
| done      |      28 |      128 |
| pending   |      71 |     1028 |
| **total** |  **99** | **1156** |
