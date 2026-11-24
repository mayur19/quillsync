# ADR-0020: No containers; native PostgreSQL locally and in CI

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-006, QS-007, QS-137
- Related: [overview section 7](../architecture/overview.md#7-deployment-topology)

## Context and Problem Statement

The system needs PostgreSQL >= 15 for development, tests and CI. Should development and CI use container images or native installations?

## Decision Drivers

- Fast, low-friction start for contributors.
- Fast CI with no image pulls.
- Integration tests must hit a real PostgreSQL, not a mock.
- Deployment target is a plain Linux host with systemd and nginx (QS-137).

## Considered Options

1. Native PostgreSQL everywhere: local install reached via Unix socket (`postgres:///quillsync_dev?host=/tmp`); CI starts the runner's preinstalled server with `sudo systemctl start postgresql.service` and creates role and databases with `sudo -u postgres psql`.
2. Container images for PostgreSQL in dev and CI service containers.
3. Embedded or in-memory PostgreSQL substitutes (pg-mem, PGlite).

## Decision Outcome

Chosen option: **1**. Containers are not used anywhere in the project. `run.sh setup` creates `quillsync_dev` and `quillsync_test`, writes `.env` with a random `SESSION_SECRET`, migrates and seeds.

### Consequences

- Good: no image pulls; CI database start takes seconds.
- Good: tests exercise real PostgreSQL semantics (unique constraints, bytea, transactions).
- Bad: contributors must install PostgreSQL 15+ themselves; versions may vary slightly between machines.
- Bad: no hermetic isolation; tests use a dedicated database and clean tables between suites.

## Pros and Cons of the Options

- Containers: hermetic versions, but an extra runtime dependency and slower CI start; contrary to the project's deployment model.
- In-memory substitutes: fast, but diverge from PostgreSQL behaviour exactly where the op log relies on it.
