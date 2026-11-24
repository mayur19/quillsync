# Product Requirements Document: quillsync

| Field                                   | Value                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product                                 | quillsync, a real-time collaborative document workspace                                                                                                                                                                                                                                                |
| Document owner                          | Product lead                                                                                                                                                                                                                                                                                           |
| Status                                  | Living document. Milestones M0 and M1 are complete; M2 to M9 are planned                                                                                                                                                                                                                               |
| Source of truth for scope and estimates | [../planning/backlog.md](../planning/backlog.md)                                                                                                                                                                                                                                                       |
| Related                                 | [requirements.md](requirements.md), [user-stories.md](user-stories.md), [requirements-traceability.md](requirements-traceability.md), [../planning/roadmap.md](../planning/roadmap.md), [../planning/implementation-status.md](../planning/implementation-status.md), [../glossary.md](../glossary.md) |

## 1. Vision

A small team can write, review and publish documents together in real time, on infrastructure it fully controls. quillsync combines the block-based workspace of tools like Notion with the live co-editing of Google Docs. Merging is handled by an in-house sequence CRDT, so concurrent edits converge without a central lock and offline edits merge cleanly when a device reconnects. The product depends on no third-party service. One Node.js process and one PostgreSQL database run the whole system, and outgoing email is written to a local outbox table.

## 2. Problem statement

Teams that write together, such as editorial desks, product teams and research groups, face three problems:

1. **Hosted collaboration tools put content on someone else's infrastructure.** Organizations with data-residency rules, air-gapped networks or plain procurement friction cannot adopt them.
2. **Self-hosted wikis do not co-edit.** They lock pages or merge whole-page revisions at save time. When two people edit the same paragraph, one of them loses work or gets a merge conflict.
3. **Weak or absent offline support.** Editors on trains, planes or flaky office Wi-Fi either cannot edit or come back to conflicting copies.

quillsync addresses these problems with character-level CRDT merging (convergence for any delivery order, NFR-001), server-mediated WebSocket fan-out (FR-033, FR-034) and a durable op log in PostgreSQL (FR-036). Snapshots and compaction (FR-050, FR-051), version history (FR-055 to FR-060), anchored comments (FR-061) and a permission model (FR-011, FR-070) come in later milestones.

## 3. Personas

### P1: Ada, workspace owner (operations lead, "Northwind Editorial")

- Sets up the workspace, invites colleagues, decides who may edit and who may only read.
- Needs: one-command install on a company server, role control (FR-011, FR-016, FR-070), an audit trail (FR-012, FR-018), backups she can trust (FR-054).
- Pain today: scattered files on shared drives, and nobody can say who changed what.

### P2: Grace, editor (staff writer)

- Spends most of the day in the editor and co-writes drafts with one to three colleagues at once.
- Needs: zero-lag typing (NFR-007), visible collaborator cursors (FR-037), rich text and blocks (FR-025, FR-026, FR-042), named versions before big rewrites (FR-056), offline work during commutes (FR-085).
- Pain today: "who has the doc open?" messages, and lost paragraphs after save conflicts.

### P3: Linus, reviewer (legal and fact-check, viewer or commenter role)

- Reads drafts and leaves comments on specific sentences. Must never change the text by accident.
- Needs: read-only enforcement (FR-035), comments anchored to text that stay attached while others edit (FR-061, FR-062), mentions that notify authors (FR-064).
- Pain today: comments in a separate document that point at stale line numbers.

### P4: Sam, self-hosting operator (IT generalist)

- Installs and runs quillsync on a Linux host with a native PostgreSQL install. Containers are not used.
- Needs: `run.sh` setup (FR-005), health and readiness probes (FR-003), a metrics endpoint (FR-088), deployment scripts with TLS (NFR-034), predictable memory per document (NFR-012).
- Pain today: collaboration servers that require a managed cloud service or an opaque binary.

## 4. Goals and non-goals

### Goals

| ID  | Goal                                                                                | Measured by                                |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| G1  | Co-editing never loses or forks content                                             | NFR-001, NFR-002, NFR-003, NFR-011         |
| G2  | Collaboration feels instant on a LAN                                                | NFR-007, NFR-009, NFR-010                  |
| G3  | Storage and memory stay bounded over a document's lifetime                          | NFR-012, NFR-013, NFR-014                  |
| G4  | Access control is correct by default                                                | FR-011, FR-035, FR-070, NFR-016 to NFR-019 |
| G5  | The full workspace experience: blocks, history, comments, search, import and export | E2, E5 to E9 FRs                           |
| G6  | Self-hosting is simple and needs no external services                               | FR-005, NFR-022, NFR-034                   |

### Non-goals (this product line)

- Hosted multi-tenant SaaS operations: billing, plan limits, SSO with external identity providers.
- Any third-party integration: email providers, object storage, analytics or error trackers. Email goes to the `outbox_messages` table.
- Native desktop or mobile apps. The web client (with the service worker, FR-087) is the only client.
- Peer-to-peer sync without a server. All sync is server-mediated, though the CRDT itself would allow it.
- Spreadsheet or database views (Notion "databases"), whiteboards, real-time audio and video.
- Operational transformation. Convergence comes from the CRDT, not from server-side transforms.
- Containers are not used: no images or orchestration manifests. Deployment uses native packages, systemd and nginx (QS-137).

## 5. Scope

### 5.1 Delivered (M0 and M1, 28 tickets, 128 h)

- Foundation: config validation, logging, envelope, migrations, `run.sh`, CI, and a 501 registry for unbuilt endpoints (FR-001 to FR-006).
- Identity: owner registration, Postgres sessions, CSRF, login rate limiting, RBAC matrix, audit write path (FR-007 to FR-012).
- CRDT core: RGA insert and delete with tombstones, causal buffer, timestamp-tree batch merge, run-length binary codec, a GC library, anchors and text diff (FR-019 to FR-024).
- Real-time sync: WebSocket protocol, in-memory rooms, durable op log with rehydration, presence carets, document list, create and read, web shell, a plain-text collaborative editor, and reconnect with resend (FR-033 to FR-041).

### 5.2 In this release (M2 to M9)

- Snapshots, compaction and server-side tombstone GC (E4).
- Rich text, blocks, tables, images and per-user undo (E2, E3 editor surface).
- Invitations, password reset, sessions and members (E1). Folders, per-document permissions and link sharing (E7).
- Version history, comments, mentions and notifications (E5, E6).
- Search, Markdown and HTML export, Markdown import (E8, E9).
- Offline persistence, multi-node fan-out, metrics, load tests, accessibility and deployment hardening (E3, E10, E11).

### 5.3 Later (not in this release)

- Database or table views with typed properties, and kanban boards.
- Public, unauthenticated publishing of pages to the web (link sharing in FR-071 still requires sign-in).
- End-to-end encryption of document content. The server must read ops to compact, search and export them.
- Federated sync between independent quillsync installations.
- Plugin or extension API.

## 6. Success metrics

Each metric is measurable on a reference deployment (one 4-vCPU, 8 GB host, PostgreSQL 15 on the same host) using the load harness (FR-089), the metrics endpoint (FR-088) and the E2E suite (FR-090).

| ID    | Metric                                                                                           | Target                                     | Source                                                           |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------- |
| SM-1  | Divergent replicas detected in property tests and E2E runs                                       | 0                                          | `packages/shared/test/crdt/convergence.property.test.ts`, QS-134 |
| SM-2  | p95 op fan-out latency (server receive to peer receive), 20 editors on LAN, 5 ops/s each         | < 100 ms                                   | QS-131 harness, NFR-009                                          |
| SM-3  | p95 local keystroke-to-render latency, 50k-character document                                    | < 16 ms                                    | QS-045 benchmark, NFR-007                                        |
| SM-4  | Acknowledged ops lost after `kill -9` of the API process                                         | 0                                          | crash test in QS-131, NFR-011                                    |
| SM-5  | Cold room load (snapshot plus tail), document with 100k ops                                      | p95 < 500 ms                               | NFR-014                                                          |
| SM-6  | Tombstones as a share of items, 30 days after last edit, all replicas acknowledged               | ≤ 20 %                                     | NFR-013                                                          |
| SM-7  | Offline edits preserved across a browser reload                                                  | 100 % of E2E cases                         | QS-120, QS-134                                                   |
| SM-8  | Serious or critical axe violations on editor and shell                                           | 0                                          | QS-133, NFR-021                                                  |
| SM-9  | Monthly availability, single-node reference deployment                                           | ≥ 99.5 %                                   | NFR-015                                                          |
| SM-10 | Time from clean Linux host with PostgreSQL to a working editor with `./run.sh`                   | ≤ 10 minutes                               | FR-005                                                           |
| SM-11 | Weekly active editors per workspace who co-edit (two or more editors in one room in one session) | ≥ 40 % of active editors, 8 weeks after M9 | metrics endpoint                                                 |
| SM-12 | High or critical findings in the dependency audit at release                                     | 0                                          | QS-132, NFR-020                                                  |

## 7. Release plan

Milestones and dates are maintained in [../planning/roadmap.md](../planning/roadmap.md). Hours come from the backlog.

| Milestone | Theme                                   |      Backlog hours | Status  | Release significance                                          |
| --------- | --------------------------------------- | -----------------: | ------- | ------------------------------------------------------------- |
| M0        | Foundation and identity                 |                 51 | done    | Internal: runnable skeleton                                   |
| M1        | CRDT core and plain-text real-time sync |                 77 | done    | Internal alpha: two people co-edit plain text                 |
| M2        | Persistence and compaction              |                 60 | pending | Durable, bounded storage. Prerequisite for history and search |
| M3        | Rich text and blocks                    |                244 | pending | Private beta: a real document editor                          |
| M4        | Workspace, access and sharing           |                116 | pending | Teams can onboard members and share documents                 |
| M5        | Version history                         |                 78 | pending | Named versions and restore                                    |
| M6        | Comments, mentions and notifications    |                100 | pending | Review workflow for P3                                        |
| M7        | Search, templates, import and export    |                118 | pending | Feature-complete for public beta                              |
| M8        | Scale, offline and hardening            |                300 | pending | Multi-node, offline-durable, accessible, observable           |
| M9        | Release stabilization                   | 0 (no new tickets) | pending | General availability: all Must FRs and NFRs verified          |

M9 has no backlog tickets by design. It is a stabilization window for bug fixing, verifying NFR targets against the reference deployment, and documentation freeze. Any work found there becomes a new ticket and is added to the backlog.

### Release gates

- **Private beta (end of M3):** FR-025, FR-026 and FR-042 implemented. NFR-001 to NFR-003 still passing with rich-text ops in the property tests.
- **Public beta (end of M7):** every Must FR in E1 and E4 to E9 implemented. NFR-011 and NFR-014 verified.
- **GA (end of M9):** every Must FR and NFR implemented and verified. SM-1 to SM-10 and SM-12 met on the reference deployment.

## 8. Assumptions and constraints

- Team of two engineers, about 25 focused engineering hours each per week (see roadmap).
- Node.js 22 or later and PostgreSQL 15 or later, installed natively. Containers are not used anywhere.
- One document's room lives in one API process at a time. Multi-node fan-out arrives with QS-053 and QS-054.
- The current CRDT stores one item per character in an array, so integration is O(n). QS-043 moves this to O(log n).

## 9. Open questions

| #   | Question                                                                                                                                         | Decision needed by |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 1   | Formatting marks (QS-040): store them as attribute ops on items, or as boundary marker items?                                                    | Start of M3        |
| 2   | Per-document GC (QS-062): if a replica has not acknowledged within N days, evict it (QS-063) and force a resync from snapshot. What should N be? | M2 design review   |
| 3   | Link sharing (QS-093): must the recipient join the organization, or can a share be a guest grant scoped to one document?                         | Start of M4        |
