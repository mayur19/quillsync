# quillsync

[![CI](https://github.com/mayur19/quillsync/actions/workflows/ci.yml/badge.svg)](https://github.com/mayur19/quillsync/actions/workflows/ci.yml)

**Write together in real time: every edit converges, even across flaky networks and offline
stretches, on infrastructure you host yourself.**

quillsync is a self-hosted collaborative document editor for teams that want Google-Docs-style
co-editing without handing their writing to a third-party service. Several people type into the
same document over WebSockets; an in-house sequence CRDT (RGA-style, with Lamport stamps,
tombstones and garbage collection) guarantees that every replica ends up with identical text no
matter how operations are ordered, duplicated or delayed. PostgreSQL is the only infrastructure:
it stores accounts, sessions, the audit trail and a durable operation log for every document.

> **Project status: early build.** The foundation (auth, sessions, CSRF, RBAC, audit, migrations,
> launcher, CI), the CRDT core with convergence property tests, the WebSocket sync server with a
> Postgres op log and presence, and a plain-text collaborative editor are implemented and tested.
> Everything else (rich text, snapshots, version history, comments, sharing, search, import/export,
> offline persistence, multi-node scale) is designed, documented and tracked in the
> [backlog](docs/planning/backlog.md): **11.1 %** of the estimated effort (128 of 1156 hours) is
> complete per [implementation status](docs/planning/implementation-status.md). Pending API
> endpoints answer `501 Not Implemented` with their ticket id, and pending screens show a
> "Planned" badge with the ticket that delivers them.

## Project status

| Area                                                                                                     | Status         | Tickets                  |
| -------------------------------------------------------------------------------------------------------- | -------------- | ------------------------ |
| Monorepo, config, error envelope, health, migrations, `run.sh`, CI, 501 registry                         | ✅ Implemented | QS-001 to QS-007, QS-013 |
| Registration (no enumeration), sessions, CSRF, login throttling, RBAC, audit log                         | ✅ Implemented | QS-008 to QS-012         |
| CRDT core: ids and vectors, RGA integration, causal buffer, tree merge, codec, GC, anchors, tests        | ✅ Implemented | QS-020 to QS-027         |
| WebSocket sync, durable op log, presence, document endpoints, web shell, editor, reconnect               | ✅ Implemented | QS-030 to QS-036         |
| Engineering documentation, ADRs, OpenAPI, backlog                                                        | ✅ Implemented | —                        |
| Invitations, password reset, session management, members, account settings, audit query, verified signup | ⏳ Pending     | QS-014 to QS-019, QS-140 |
| Rich-text marks, block model, block moves, indexed sequence, undo, tables, images                        | ⏳ Pending     | QS-040 to QS-047         |
| Rich-text editor surface, awareness, backpressure, multi-node fan-out, binary frames                     | ⏳ Pending     | QS-050 to QS-057         |
| Snapshots, op-log compaction, server GC frontier, stale replicas, backup verification                    | ⏳ Pending     | QS-060 to QS-064         |
| Version history: checkpoints, named versions, diff, restore, retention                                   | ⏳ Pending     | QS-070 to QS-075         |
| Anchored comments, mentions, notifications, reactions                                                    | ⏳ Pending     | QS-080 to QS-086         |
| Folders, document lifecycle, per-document permissions, link sharing, templates, activity feed            | ⏳ Pending     | QS-090 to QS-096         |
| Full-text search (tsvector), ranking, permission filtering, search UI                                    | ⏳ Pending     | QS-100 to QS-104         |
| Markdown/HTML export, Markdown import, export jobs, workspace archive                                    | ⏳ Pending     | QS-110 to QS-114         |
| Offline: IndexedDB persistence, offline UX, app shell                                                    | ⏳ Pending     | QS-120 to QS-122         |
| Metrics, load tests, CSP, accessibility, E2E suite, retention, admin console, deployment, i18n           | ⏳ Pending     | QS-130 to QS-139         |

## Quick start

Requirements: Node.js 22+, npm, and a local PostgreSQL 15+ server reachable over the Unix socket in
`/tmp` as your OS user without a password (the defaults in `.env.example`).

```bash
./run.sh
```

This checks prerequisites, creates `.env` from `.env.example` with a random `SESSION_SECRET`,
installs dependencies, creates the `quillsync_dev` database, applies migrations, seeds demo data and
starts:

- Web: http://localhost:5104
- API: http://127.0.0.1:4104 (proxied by the web dev server under `/api`, including the sync
  WebSocket)

Open the same document in two browsers (or a private window) to watch edits, presence and remote
carets sync.

## Demo logins (development only)

These accounts are created by the development seed and are public; never load them into a
production database. Password for all: `quillsync-demo-1`.

| Email                  | Role   | Organization        |
| ---------------------- | ------ | ------------------- |
| `ada@northwind.test`   | Owner  | Northwind Editorial |
| `grace@northwind.test` | Editor | Northwind Editorial |
| `linus@northwind.test` | Viewer | Northwind Editorial |

Seeded documents: "Q3 launch plan", "Style guide" and "Interview notes". Each is built by
simulating two replicas editing concurrently and is stored as real op-log batches, so opening one
rehydrates the CRDT exactly as the sync server would. The viewer account shows the read-only mode.

## run.sh commands

| Command                     | Description                                                               |
| --------------------------- | ------------------------------------------------------------------------- |
| `./run.sh` / `./run.sh dev` | Install deps, prepare `.env` + database, migrate, seed, launch API + web  |
| `./run.sh start`            | Alias of `dev`                                                            |
| `./run.sh setup`            | Everything `dev` does, without launching                                  |
| `./run.sh migrate`          | Apply pending database migrations                                         |
| `./run.sh seed`             | Load development demo data (idempotent)                                   |
| `./run.sh reset [--yes]`    | Drop and recreate the schema, then migrate + seed (refused in production) |
| `./run.sh test`             | Unit + integration tests against the `quillsync_test` database            |
| `./run.sh e2e`              | Playwright end-to-end tests (smoke + two-browser collaboration)           |
| `./run.sh check`            | Lint, format check, typecheck and tests (what CI runs)                    |
| `./run.sh build`            | Production build of API and web                                           |
| `./run.sh help`             | Show all commands                                                         |

## Tech stack

| Layer    | Technology                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------- |
| API      | Node.js 22, Fastify 5, @fastify/websocket (ws), @fastify/cookie, TypeScript (strict), zod, pg, pino |
| Web      | React 18, React Router 6, Vite 5, plain CSS with design tokens                                      |
| Database | PostgreSQL 15+, forward-only SQL migrations with checksums                                          |
| Shared   | `@quillsync/shared`: sequence CRDT, sync protocol schemas, RBAC matrix, text diff                   |
| Tests    | Vitest 3, Testing Library, Fastify inject and real `ws` clients against PostgreSQL, Playwright      |
| Tooling  | npm workspaces, ESLint 9, Prettier, tsup, tsx, GitHub Actions (native runner PostgreSQL)            |

## Repository layout

```
quillsync/
├── apps/
│   ├── api/                       Fastify API + WebSocket sync server
│   │   ├── migrations/            0001_foundation.sql, 0002_documents_op_log.sql
│   │   ├── src/
│   │   │   ├── config/ db/ http/  env loader, pool + migrator + seed, envelope, CSRF, guards, limiters
│   │   │   └── modules/
│   │   │       ├── health/ auth/ audit/    foundation (implemented)
│   │   │       ├── documents/              list, create, read (implemented)
│   │   │       ├── collab/                 rooms, op log, sync protocol (implemented slice)
│   │   │       └── pending/                registry of planned routes answering 501
│   │   └── test/                  integration tests against real PostgreSQL and ws clients
│   └── web/                       React SPA
│       └── src/
│           ├── collab/            sync client: outbox, reconnect, resend (implemented)
│           ├── pages/             login, register, documents, editor (implemented); PlannedPage
│           └── components/        app shell, presence list, remote carets
├── packages/shared/
│   ├── src/crdt/                  ids, integration, causal buffer, tree merge, runs, codec, GC, anchors
│   ├── src/protocol/ rbac/ schemas/ text/
│   └── test/                      unit, property (convergence) and fuzz tests
├── e2e/                           Playwright config, smoke and collaboration specs
├── docs/                          product, architecture, ADRs, design, API, security, testing, ops, planning
├── run.sh                         single entry point
└── .env.example                   placeholder configuration
```

## Documentation

Start with the [documentation index](docs/README.md). Key documents:
[PRD](docs/product/PRD.md) ·
[requirements](docs/product/requirements.md) ·
[architecture](docs/architecture/overview.md) ·
[ADRs](docs/adr/README.md) ·
[data model](docs/design/data-model.md) ·
[system design](docs/design/system-design.md) ·
[API](docs/api/README.md) ·
[OpenAPI](docs/api/openapi.yaml) ·
[threat model](docs/security/threat-model.md) ·
[test strategy](docs/testing/test-strategy.md) ·
[runbook](docs/operations/runbook.md) ·
[deployment](docs/operations/deployment.md) ·
[roadmap](docs/planning/roadmap.md) ·
[backlog](docs/planning/backlog.md) ·
[implementation status](docs/planning/implementation-status.md)

## Known limitations

- The editor is plain text in a textarea; rich text and blocks are pending (QS-040, QS-041, QS-050).
- Rooms live in one API process and login/registration throttle counters are in memory, so run a
  single instance until multi-node fan-out moves them to PostgreSQL (QS-053, QS-054).
- No snapshots yet: rooms rehydrate from the full op log, and the GC library is not wired to the
  server, so tombstones and deleted text stay in storage (QS-060 to QS-062).
- Offline edits survive a disconnect but not a page reload (IndexedDB persistence is QS-120).
- Registration activates accounts immediately; email verification through the local outbox is
  QS-140.
- Playwright specs are not run in CI (no browsers on the runner); run them locally with
  `./run.sh e2e`.

## Contributing, security and license

- [Contributing guide](CONTRIBUTING.md): workflow, migrations, commit conventions.
- [Security policy](SECURITY.md): how to report vulnerabilities; security model summary.
- [Changelog](CHANGELOG.md).
- Licensed under the [MIT License](LICENSE).
