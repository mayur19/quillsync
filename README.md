# quillsync

Real-time collaborative document editing built on an **in-house sequence CRDT**. Several people type into the same document at once, over WebSockets, and every replica converges to the same text regardless of network order, duplication or disconnects. No third-party services: PostgreSQL is the only infrastructure.

> **Status:** foundation plus the first vertical slice (about 11% of the planned 1156 engineering hours, see [implementation status](docs/planning/implementation-status.md)). Everything not yet built is registered in the API and answers `501 NOT_IMPLEMENTED` with its backlog ticket.

## What works today

- **CRDT core** (`packages/shared/src/crdt`): RGA-style sequence CRDT with Lamport stamps and contiguous `(client, seq)` ids, tombstones, a causal readiness buffer (any delivery order, any number of duplicates), O(n log n) timestamp-tree batch merge, run-length op compression, a fuzzed binary varint codec, caret/comment anchors and two garbage-collection strategies (childless-tombstone GC and quiescent compaction under causal stability).
- **Convergence property tests**: 120+ seeded random sessions with 2-5 replicas, random partial/out-of-order/duplicated delivery, checking identical order on every replica and agreement between incremental integration and tree materialization.
- **Sync server** (`apps/api/src/modules/collab`): one authoritative room per document, a per-room serial queue, persist-before-ack into a Postgres op log (binary batches, idempotent on retry), delta sync from state vectors, presence fan-out, Origin-checked and role-aware WebSocket upgrades.
- **Web editor** (`apps/web`): plain-text collaborative editor with remote carets anchored to CRDT positions, presence list, reconnect with jittered backoff and resend of unacknowledged edits (offline edits merge on reconnect).
- **Foundation**: Fastify 5 API with zod validation and a uniform JSON envelope, Postgres sessions (scrypt, HMAC-hashed tokens), CSRF double submit, RBAC (owner/editor/commenter/viewer), audit log, layered login throttling, forward-only SQL migrations, a single `run.sh` launcher.

## Quick start

Requirements: Node.js 22+, a local PostgreSQL 15+ server (socket in `/tmp`, your OS user, no password).

```bash
./run.sh            # install, create .env with random secrets, create DB, migrate, seed, start API + web
```

Open http://localhost:5104 and sign in with a demo account (development data only, password `quillsync-demo-1`):

| Email                  | Role   |
| ---------------------- | ------ |
| `ada@northwind.test`   | owner  |
| `grace@northwind.test` | editor |
| `linus@northwind.test` | viewer |

Open the same document in two browsers (or a private window) to watch edits and carets sync.

| Command            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `./run.sh help`    | List commands                                          |
| `./run.sh setup`   | Prepare everything without starting servers            |
| `./run.sh migrate` | Apply pending migrations                               |
| `./run.sh seed`    | Load demo data (idempotent)                            |
| `./run.sh reset`   | Drop, migrate and reseed the dev database              |
| `./run.sh test`    | Unit and integration tests against `quillsync_test`    |
| `./run.sh dev`     | Default: setup, then API on :4104 and web on :5104     |
| `./run.sh check`   | Lint, format check, typecheck and tests (what CI runs) |
| `./run.sh e2e`     | Playwright smoke and two-browser collaboration specs   |

## Repository layout

```
apps/api/         Fastify 5 API + WebSocket sync server, SQL migrations, integration tests
apps/web/         React 18 + Vite client (plain CSS design tokens)
packages/shared/  CRDT, protocol schemas, RBAC matrix, text diff (pure, fully unit tested)
docs/             product, architecture, ADRs, design, API (OpenAPI 3.1), security, testing, operations, planning
e2e/              Playwright specs (run locally; not part of CI)
run.sh            launcher
```

## Quality gates

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run build` all pass locally and in CI (GitHub Actions on the runner's native PostgreSQL; no containers). 361 tests: shared 251, API 86, web 24. Coverage thresholds are enforced per workspace (statements: shared ~99%, API ~97%, web ~98%).

## Documentation

Start at [docs/README.md](docs/README.md). Highlights:

- [System design](docs/design/system-design.md): the CRDT algorithms with proofs sketches and complexity, sync sequences, consistency strategy
- [ADRs](docs/adr/README.md): 21 decisions, from "RGA over YATA/Logoot/OT" to "persist before ack"
- [OpenAPI](docs/api/openapi.yaml): full target API with `x-status: implemented | pending`
- [Backlog](docs/planning/backlog.md) and [roadmap](docs/planning/roadmap.md)
- [Threat model](docs/security/threat-model.md)

## License

MIT, see [LICENSE](LICENSE).
