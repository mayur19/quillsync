# Requirements traceability matrix

This matrix maps every functional requirement in [requirements.md](requirements.md) to its epic, its backlog tickets ([../planning/backlog.md](../planning/backlog.md)), the module that implements it, and the test that verifies it.

- **Module**: for implemented FRs this is the existing source path. For pending FRs it is the planned path, marked _(planned)_. Planned paths follow the existing layout: API features under `apps/api/src/modules/<feature>/`, pure logic under `packages/shared/src/`, client code under `apps/web/src/`.
- **Test**: for implemented FRs this is the existing test file. For pending FRs it reads `planned`.
- **Status**: copied from requirements.md. An FR is `implemented` only when all its tickets are `done`.

Coverage: 95 of 95 FRs are mapped (27 implemented, 68 pending). NFR verification methods are listed in the NFR table of requirements.md.

## E0: Foundation

| FR     | Epic | Tickets | Module                                                                                               | Test                                                                                                  | Status      |
| ------ | ---- | ------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| FR-001 | E0   | QS-002  | `apps/api/src/config/env.ts`                                                                         | `apps/api/test/config.test.ts`                                                                        | implemented |
| FR-002 | E0   | QS-003  | `apps/api/src/http/envelope.ts`, `apps/api/src/http/errors.ts`, `apps/api/src/http/error-handler.ts` | `apps/api/test/health.test.ts`, `apps/api/test/pending.test.ts`                                       | implemented |
| FR-003 | E0   | QS-004  | `apps/api/src/modules/health/`                                                                       | `apps/api/test/health.test.ts`                                                                        | implemented |
| FR-004 | E0   | QS-005  | `apps/api/src/db/migrate.ts`, `apps/api/migrations/`                                                 | `apps/api/test/migrate.test.ts`                                                                       | implemented |
| FR-005 | E0   | QS-006  | `run.sh`, `apps/api/src/db/cli.ts`, `apps/api/src/db/seed.ts`                                        | `.github/workflows/ci.yml` (migrate and test steps); seed checked by `e2e/smoke.spec.ts` (local only) | implemented |
| FR-006 | E0   | QS-013  | `apps/api/src/http/not-implemented.ts`, `apps/api/src/modules/pending/`                              | `apps/api/test/pending.test.ts`                                                                       | implemented |

## E1: Identity and access

| FR     | Epic | Tickets | Module                                                                                               | Test                                                                   | Status      |
| ------ | ---- | ------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| FR-007 | E1   | QS-008  | `apps/api/src/modules/auth/`                                                                         | `apps/api/test/auth.test.ts`                                           | implemented |
| FR-008 | E1   | QS-009  | `apps/api/src/modules/auth/`, `apps/api/src/http/auth-guard.ts`                                      | `apps/api/test/auth.test.ts`, `apps/web/test/login.test.tsx`           | implemented |
| FR-009 | E1   | QS-010  | `apps/api/src/http/csrf.ts`                                                                          | `apps/api/test/auth.test.ts`                                           | implemented |
| FR-010 | E1   | QS-010  | `apps/api/src/http/rate-limit.ts`                                                                    | `apps/api/test/auth.test.ts`, `rate-limit.test.ts`                     | implemented |
| FR-011 | E1   | QS-011  | `packages/shared/src/rbac/permissions.ts`, `apps/api/src/http/auth-guard.ts`                         | `packages/shared/test/rbac.test.ts`, `apps/api/test/documents.test.ts` | implemented |
| FR-012 | E1   | QS-012  | `apps/api/src/modules/audit/`                                                                        | `apps/api/test/auth.test.ts`                                           | implemented |
| FR-013 | E1   | QS-014  | `apps/api/src/modules/invitations/` _(planned)_, `apps/api/src/modules/outbox/` _(planned)_          | planned                                                                | pending     |
| FR-014 | E1   | QS-015  | `apps/api/src/modules/auth/password-reset.*` _(planned)_, `apps/api/src/modules/outbox/` _(planned)_ | planned                                                                | pending     |
| FR-015 | E1   | QS-016  | `apps/api/src/modules/auth/sessions.*` _(planned)_                                                   | planned                                                                | pending     |
| FR-016 | E1   | QS-017  | `apps/api/src/modules/members/` _(planned)_                                                          | planned                                                                | pending     |
| FR-017 | E1   | QS-018  | `apps/api/src/modules/account/` _(planned)_, `apps/web/src/account/` _(planned)_                     | planned                                                                | pending     |
| FR-018 | E1   | QS-019  | `apps/api/src/modules/audit/` (query routes, planned), `apps/web/src/admin/` _(planned)_             | planned                                                                | pending     |

## E2: CRDT core

| FR     | Epic | Tickets                | Module                                                                                                                                                                                           | Test                                                                                                      | Status      |
| ------ | ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------- |
| FR-019 | E2   | QS-020, QS-021, QS-027 | `packages/shared/src/crdt/ids.ts`, `packages/shared/src/crdt/types.ts`, `packages/shared/src/crdt/integrate.ts`, `packages/shared/src/crdt/document.ts`, `packages/shared/src/crdt/local-ops.ts` | `packages/shared/test/crdt/integrate.test.ts`, `packages/shared/test/crdt/convergence.property.test.ts`   | implemented |
| FR-020 | E2   | QS-022                 | `packages/shared/src/crdt/document.ts`                                                                                                                                                           | `packages/shared/test/crdt/integrate.test.ts`                                                             | implemented |
| FR-021 | E2   | QS-023                 | `packages/shared/src/crdt/materialize.ts`                                                                                                                                                        | `packages/shared/test/crdt/materialize.test.ts`, `packages/shared/test/crdt/convergence.property.test.ts` | implemented |
| FR-022 | E2   | QS-024                 | `packages/shared/src/crdt/runs.ts`, `packages/shared/src/crdt/codec.ts`                                                                                                                          | `packages/shared/test/crdt/runs.test.ts`, `packages/shared/test/crdt/codec.test.ts`                       | implemented |
| FR-023 | E2   | QS-025                 | `packages/shared/src/crdt/gc.ts`                                                                                                                                                                 | `packages/shared/test/crdt/gc.test.ts`                                                                    | implemented |
| FR-024 | E2   | QS-026                 | `packages/shared/src/crdt/anchors.ts`, `packages/shared/src/text/diff.ts`                                                                                                                        | `packages/shared/test/crdt/anchors.test.ts`, `packages/shared/test/text/diff.test.ts`                     | implemented |
| FR-025 | E2   | QS-040                 | `packages/shared/src/crdt/marks.ts` _(planned)_                                                                                                                                                  | planned                                                                                                   | pending     |
| FR-026 | E2   | QS-041                 | `packages/shared/src/crdt/blocks.ts` _(planned)_                                                                                                                                                 | planned                                                                                                   | pending     |
| FR-027 | E2   | QS-042                 | `packages/shared/src/crdt/block-move.ts` _(planned)_                                                                                                                                             | planned                                                                                                   | pending     |
| FR-028 | E2   | QS-043                 | `packages/shared/src/crdt/btree.ts` _(planned)_                                                                                                                                                  | planned                                                                                                   | pending     |
| FR-029 | E2   | QS-044                 | `packages/shared/src/crdt/undo.ts` _(planned)_                                                                                                                                                   | planned                                                                                                   | pending     |
| FR-030 | E2   | QS-045                 | `packages/shared/bench/` _(planned)_                                                                                                                                                             | planned                                                                                                   | pending     |
| FR-031 | E2   | QS-046                 | `packages/shared/src/crdt/tables.ts` _(planned)_                                                                                                                                                 | planned                                                                                                   | pending     |
| FR-032 | E2   | QS-047                 | `apps/api/src/modules/uploads/` _(planned)_, `packages/shared/src/crdt/blocks.ts` _(planned)_                                                                                                    | planned                                                                                                   | pending     |

## E3: Real-time sync

| FR     | Epic | Tickets        | Module                                                                                                                                | Test                                                                                            | Status      |
| ------ | ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| FR-033 | E3   | QS-030         | `apps/api/src/modules/collab/sync.routes.ts`, `apps/api/src/modules/collab/connection.ts`, `packages/shared/src/protocol/messages.ts` | `apps/api/test/collab-sync.test.ts`, `packages/shared/test/protocol.test.ts`                    | implemented |
| FR-034 | E3   | QS-030         | `apps/api/src/modules/collab/room.ts`, `apps/api/src/modules/collab/room-registry.ts`                                                 | `apps/api/test/room.test.ts`, `apps/api/test/collab-sync.test.ts`                               | implemented |
| FR-035 | E3   | QS-030, QS-011 | `apps/api/src/modules/collab/sync.routes.ts`, `apps/api/src/modules/collab/connection.ts`                                             | `apps/api/test/collab-sync.test.ts` (viewer rejected, bad origin rejected)                      | implemented |
| FR-036 | E3   | QS-031         | `apps/api/src/modules/collab/op-log.repository.ts`, `apps/api/migrations/0002_documents_op_log.sql`                                   | `apps/api/test/collab-sync.test.ts` (persistence and rehydration), `apps/api/test/room.test.ts` | implemented |
| FR-037 | E3   | QS-032, QS-035 | `apps/api/src/modules/collab/room.ts`, `apps/web/src/collab/`                                                                         | `apps/web/test/presence.test.tsx`, `apps/api/test/collab-sync.test.ts`                          | implemented |
| FR-038 | E3   | QS-033         | `apps/api/src/modules/documents/`                                                                                                     | `apps/api/test/documents.test.ts`                                                               | implemented |
| FR-039 | E3   | QS-034         | `apps/web/src/` (shell, routes)                                                                                                       | `apps/web/test/app-shell.test.tsx`, `apps/web/test/login.test.tsx`                              | implemented |
| FR-040 | E3   | QS-035         | `apps/web/src/collab/` (editor, sync engine)                                                                                          | `apps/web/test/sync-client.test.ts`, `e2e/collaboration.spec.ts` (local only)                   | implemented |
| FR-041 | E3   | QS-036         | `apps/web/src/collab/` (outbound queue, reconnect)                                                                                    | `apps/web/test/sync-client.test.ts`                                                             | implemented |
| FR-042 | E3   | QS-050         | `apps/web/src/editor/` _(planned)_                                                                                                    | planned                                                                                         | pending     |
| FR-043 | E3   | QS-051         | `apps/web/src/collab/awareness.*` _(planned)_                                                                                         | planned                                                                                         | pending     |
| FR-044 | E3   | QS-052         | `apps/api/src/modules/collab/backpressure.ts` _(planned)_                                                                             | planned                                                                                         | pending     |
| FR-045 | E3   | QS-053         | `apps/api/src/modules/collab/pg-fanout.ts` _(planned)_                                                                                | planned                                                                                         | pending     |
| FR-046 | E3   | QS-054         | `apps/api/src/modules/collab/room-ownership.ts` _(planned)_                                                                           | planned                                                                                         | pending     |
| FR-047 | E3   | QS-055         | `apps/api/src/modules/collab/connection.ts` (binary frames, planned)                                                                  | planned                                                                                         | pending     |
| FR-048 | E3   | QS-056         | `apps/api/src/modules/collab/reauth.ts` _(planned)_                                                                                   | planned                                                                                         | pending     |
| FR-049 | E3   | QS-057         | `apps/api/src/modules/collab/presence-throttle.ts` _(planned)_                                                                        | planned                                                                                         | pending     |

## E4: Persistence and compaction

| FR     | Epic | Tickets | Module                                                                                                  | Test    | Status  |
| ------ | ---- | ------- | ------------------------------------------------------------------------------------------------------- | ------- | ------- |
| FR-050 | E4   | QS-060  | `apps/api/src/modules/snapshots/` _(planned)_                                                           | planned | pending |
| FR-051 | E4   | QS-061  | `apps/api/src/modules/snapshots/compaction.ts` _(planned)_                                              | planned | pending |
| FR-052 | E4   | QS-062  | `apps/api/src/modules/collab/replicas.repository.ts` _(planned)_, uses `packages/shared/src/crdt/gc.ts` | planned | pending |
| FR-053 | E4   | QS-063  | `apps/api/src/modules/collab/replica-eviction.ts` _(planned)_                                           | planned | pending |
| FR-054 | E4   | QS-064  | `run.sh` (backup verification, planned), `apps/api/src/db/backup-verify.ts` _(planned)_                 | planned | pending |

## E5: Version history

| FR     | Epic | Tickets | Module                                                                                          | Test    | Status  |
| ------ | ---- | ------- | ----------------------------------------------------------------------------------------------- | ------- | ------- |
| FR-055 | E5   | QS-070  | `apps/api/src/modules/versions/checkpoints.ts` _(planned)_                                      | planned | pending |
| FR-056 | E5   | QS-071  | `apps/api/src/modules/versions/` _(planned)_                                                    | planned | pending |
| FR-057 | E5   | QS-072  | `packages/shared/src/crdt/version-diff.ts` _(planned)_                                          | planned | pending |
| FR-058 | E5   | QS-073  | `packages/shared/src/crdt/restore.ts` _(planned)_, `apps/api/src/modules/versions/` _(planned)_ | planned | pending |
| FR-059 | E5   | QS-074  | `apps/web/src/history/` _(planned)_                                                             | planned | pending |
| FR-060 | E5   | QS-075  | `apps/api/src/modules/versions/retention.ts` _(planned)_                                        | planned | pending |

## E6: Comments, mentions and notifications

| FR     | Epic | Tickets | Module                                                                                       | Test    | Status  |
| ------ | ---- | ------- | -------------------------------------------------------------------------------------------- | ------- | ------- |
| FR-061 | E6   | QS-080  | `apps/api/src/modules/comments/` _(planned)_, uses `packages/shared/src/crdt/anchors.ts`     | planned | pending |
| FR-062 | E6   | QS-081  | `apps/api/src/modules/comments/anchors.ts` _(planned)_                                       | planned | pending |
| FR-063 | E6   | QS-082  | `apps/api/src/modules/comments/` _(planned)_, `apps/web/src/comments/` _(planned)_           | planned | pending |
| FR-064 | E6   | QS-083  | `apps/api/src/modules/notifications/mentions.ts` _(planned)_                                 | planned | pending |
| FR-065 | E6   | QS-084  | `apps/api/src/modules/notifications/` _(planned)_, `apps/web/src/notifications/` _(planned)_ | planned | pending |
| FR-066 | E6   | QS-085  | `apps/api/src/modules/notifications/digest.ts` _(planned)_                                   | planned | pending |
| FR-067 | E6   | QS-086  | `apps/api/src/modules/comments/reactions.ts` _(planned)_                                     | planned | pending |

## E7: Workspace, folders and sharing

| FR     | Epic | Tickets | Module                                                                                     | Test    | Status  |
| ------ | ---- | ------- | ------------------------------------------------------------------------------------------ | ------- | ------- |
| FR-068 | E7   | QS-090  | `apps/api/src/modules/folders/` _(planned)_                                                | planned | pending |
| FR-069 | E7   | QS-091  | `apps/api/src/modules/documents/` (lifecycle routes, planned)                              | planned | pending |
| FR-070 | E7   | QS-092  | `apps/api/src/modules/permissions/` _(planned)_, `packages/shared/src/rbac/permissions.ts` | planned | pending |
| FR-071 | E7   | QS-093  | `apps/api/src/modules/share-links/` _(planned)_                                            | planned | pending |
| FR-072 | E7   | QS-094  | `apps/api/src/modules/auth/` (organization switch, planned), `apps/web/src/` shell         | planned | pending |
| FR-073 | E7   | QS-095  | `apps/api/src/modules/templates/` _(planned)_                                              | planned | pending |
| FR-074 | E7   | QS-096  | `apps/api/src/modules/activity/` _(planned)_                                               | planned | pending |

## E8: Search

| FR     | Epic | Tickets | Module                                                      | Test    | Status  |
| ------ | ---- | ------- | ----------------------------------------------------------- | ------- | ------- |
| FR-075 | E8   | QS-100  | `apps/api/src/modules/search/projection.ts` _(planned)_     | planned | pending |
| FR-076 | E8   | QS-101  | `apps/api/src/modules/search/` _(planned)_                  | planned | pending |
| FR-077 | E8   | QS-102  | `apps/api/src/modules/search/` (permission filter, planned) | planned | pending |
| FR-078 | E8   | QS-103  | `apps/web/src/search/` _(planned)_                          | planned | pending |
| FR-079 | E8   | QS-104  | `apps/api/src/modules/search/` (comment index, planned)     | planned | pending |

## E9: Import and export

| FR     | Epic | Tickets | Module                                                                                           | Test    | Status  |
| ------ | ---- | ------- | ------------------------------------------------------------------------------------------------ | ------- | ------- |
| FR-080 | E9   | QS-110  | `packages/shared/src/export/markdown.ts` _(planned)_, `apps/api/src/modules/export/` _(planned)_ | planned | pending |
| FR-081 | E9   | QS-111  | `packages/shared/src/export/html.ts` _(planned)_                                                 | planned | pending |
| FR-082 | E9   | QS-112  | `packages/shared/src/import/markdown.ts` _(planned)_, `apps/api/src/modules/import/` _(planned)_ | planned | pending |
| FR-083 | E9   | QS-113  | `apps/api/src/modules/export/jobs.ts` _(planned)_                                                | planned | pending |
| FR-084 | E9   | QS-114  | `apps/api/src/modules/export/workspace-archive.ts` _(planned)_                                   | planned | pending |

## E10: Offline

| FR     | Epic | Tickets | Module                                             | Test    | Status  |
| ------ | ---- | ------- | -------------------------------------------------- | ------- | ------- |
| FR-085 | E10  | QS-120  | `apps/web/src/collab/idb-store.ts` _(planned)_     | planned | pending |
| FR-086 | E10  | QS-121  | `apps/web/src/collab/offline-status.*` _(planned)_ | planned | pending |
| FR-087 | E10  | QS-122  | `apps/web/src/sw.ts` _(planned)_                   | planned | pending |

## E11: Operations and hardening

| FR     | Epic | Tickets | Module                                                                                | Test    | Status  |
| ------ | ---- | ------- | ------------------------------------------------------------------------------------- | ------- | ------- |
| FR-088 | E11  | QS-130  | `apps/api/src/modules/metrics/` _(planned)_                                           | planned | pending |
| FR-089 | E11  | QS-131  | `tools/loadtest/` _(planned)_                                                         | planned | pending |
| FR-090 | E11  | QS-134  | `e2e/` (extends `e2e/collaboration.spec.ts`), `.github/workflows/ci.yml`              | planned | pending |
| FR-091 | E11  | QS-135  | `apps/api/src/modules/retention/` _(planned)_                                         | planned | pending |
| FR-092 | E11  | QS-136  | `apps/web/src/admin/` _(planned)_, `apps/api/src/modules/admin/` _(planned)_          | planned | pending |
| FR-093 | E11  | QS-138  | `apps/web/src/` (layout styles, planned)                                              | planned | pending |
| FR-094 | E11  | QS-139  | `apps/web/src/i18n/` _(planned)_                                                      | planned | pending |
| FR-095 | E1   | QS-140  | `apps/api/src/modules/auth/` (activation), `apps/api/src/modules/outbox/` _(planned)_ | planned | pending |

## Tickets covered only by NFRs

These tickets have no FR of their own. They are verified through NFRs:

| Ticket | NFRs             |
| ------ | ---------------- |
| QS-001 | NFR-022, NFR-025 |
| QS-007 | NFR-025          |
| QS-132 | NFR-020          |
| QS-133 | NFR-021          |
| QS-137 | NFR-015, NFR-034 |

## Reverse index: pending ticket to FR

| Ticket | FR      | Ticket | FR      | Ticket | FR      |
| ------ | ------- | ------ | ------- | ------ | ------- |
| QS-014 | FR-013  | QS-056 | FR-048  | QS-090 | FR-068  |
| QS-140 | FR-095  |        |         |        |         |
| QS-015 | FR-014  | QS-057 | FR-049  | QS-091 | FR-069  |
| QS-016 | FR-015  | QS-060 | FR-050  | QS-092 | FR-070  |
| QS-017 | FR-016  | QS-061 | FR-051  | QS-093 | FR-071  |
| QS-018 | FR-017  | QS-062 | FR-052  | QS-094 | FR-072  |
| QS-019 | FR-018  | QS-063 | FR-053  | QS-095 | FR-073  |
| QS-040 | FR-025  | QS-064 | FR-054  | QS-096 | FR-074  |
| QS-041 | FR-026  | QS-070 | FR-055  | QS-100 | FR-075  |
| QS-042 | FR-027  | QS-071 | FR-056  | QS-101 | FR-076  |
| QS-043 | FR-028  | QS-072 | FR-057  | QS-102 | FR-077  |
| QS-044 | FR-029  | QS-073 | FR-058  | QS-103 | FR-078  |
| QS-045 | FR-030  | QS-074 | FR-059  | QS-104 | FR-079  |
| QS-046 | FR-031  | QS-075 | FR-060  | QS-110 | FR-080  |
| QS-047 | FR-032  | QS-080 | FR-061  | QS-111 | FR-081  |
| QS-050 | FR-042  | QS-081 | FR-062  | QS-112 | FR-082  |
| QS-051 | FR-043  | QS-082 | FR-063  | QS-113 | FR-083  |
| QS-052 | FR-044  | QS-083 | FR-064  | QS-114 | FR-084  |
| QS-053 | FR-045  | QS-084 | FR-065  | QS-120 | FR-085  |
| QS-054 | FR-046  | QS-085 | FR-066  | QS-121 | FR-086  |
| QS-055 | FR-047  | QS-086 | FR-067  | QS-122 | FR-087  |
| QS-130 | FR-088  | QS-131 | FR-089  | QS-134 | FR-090  |
| QS-135 | FR-091  | QS-136 | FR-092  | QS-138 | FR-093  |
| QS-139 | FR-094  | QS-132 | NFR-020 | QS-133 | NFR-021 |
| QS-137 | NFR-034 |        |         |        |         |
