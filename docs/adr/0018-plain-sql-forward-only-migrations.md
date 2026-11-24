# ADR-0018: Plain SQL, forward-only migrations with checksum verification

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-005
- Related: [data-model section 5](../design/data-model.md#5-migrations)

## Context and Problem Statement

The schema relies on PostgreSQL features (bytea, jsonb, partial indexes, check constraints, planned tsvector + GIN, advisory locks). How are schema changes written and applied?

## Decision Drivers

- Full access to PostgreSQL DDL without an abstraction layer.
- Reproducible schema in dev, test and CI.
- Detect edited history.

## Considered Options

1. Numbered `.sql` files in `apps/api/migrations` (`0001_foundation.sql`, `0002_documents_op_log.sql`, ...) applied in order inside transactions by `db/migrate.ts`; a bookkeeping table records name and checksum; changed checksums abort.
2. ORM migrations (Prisma, TypeORM, Drizzle Kit).
3. Up/down migrations with rollback scripts.

## Decision Outcome

Chosen option: **1**. Migrations are forward-only; a mistake is fixed by a new migration. `run.sh migrate` and `run.sh reset` call the runner; `migrate.test.ts` verifies ordering, idempotency and checksum mismatch detection.

### Consequences

- Good: reviewers read exactly the SQL that runs.
- Good: no ORM query layer; repositories use parameterized `pg` queries.
- Bad: no automatic down migrations; rollback means restore from backup (QS-064) or a corrective migration.
- Bad: types are maintained by hand alongside zod schemas.

## Pros and Cons of the Options

- ORM migrations: typed models and automatic SQL diffs, but weak support for bytea-heavy, Postgres-specific designs and another source of truth.
- Up/down: rollback scripts are rarely tested and often wrong for data migrations.
