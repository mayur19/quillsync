# Contributing

## Setup

```bash
./run.sh setup   # Node 22+, local PostgreSQL 15+ (socket in /tmp, OS user)
./run.sh dev
```

## Workflow

1. Pick a ticket from [docs/planning/backlog.md](docs/planning/backlog.md); its GitHub issue links the FRs it satisfies.
2. Write tests first. CRDT changes need property-test coverage in `packages/shared/test/crdt` (convergence across random delivery orders is the bar, not a single example).
3. Keep domain logic pure and immutable (functions return new state), files under ~400 lines and functions small.
4. Validate every boundary with zod (HTTP bodies, WebSocket frames, env).
5. Replace the 501 stub in `apps/api/src/modules/pending/pending.routes.ts`, flip `x-status` to `implemented` in `docs/api/openapi.yaml`, mark the ticket `done` in the backlog and update `docs/planning/implementation-status.md`.
6. Run `./run.sh check` before pushing.

## Migrations

Forward-only plain SQL in `apps/api/migrations/NNNN_description.sql`. Never edit an applied migration; the runner refuses changed checksums. Add a new file instead.

## Commits

Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `perf:`. One logical change per commit.

## Code style

Prettier and ESLint configs live at the repository root. `npm run format` fixes formatting.
