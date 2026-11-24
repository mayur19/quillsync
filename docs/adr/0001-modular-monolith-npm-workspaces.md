# ADR-0001: Modular monolith in npm workspaces

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-001
- Related: [ADR-0002](0002-fastify-5-http-and-websocket.md), [ADR-0003](0003-in-house-crdt-instead-of-libraries.md), [overview section 4](../architecture/overview.md#4-module-boundaries-and-dependency-rules)

## Context and Problem Statement

quillsync has three bodies of code with very different constraints: a browser SPA, a Node.js server that holds live editing rooms, and a CRDT that must behave **bit-for-bit identically** in both. How should the code be partitioned into deployable and buildable units?

## Decision Drivers

- The CRDT, protocol schemas and RBAC matrix must be shared without publishing or version skew between client and server.
- A single developer or small team must be able to run, test and refactor across the whole system in one change.
- Rooms are stateful and latency-sensitive; extra network hops between services would sit on the hot path.
- Boundaries must still be explicit enough to extract a service later (for example a dedicated sync tier after QS-053/054).

## Considered Options

1. Modular monolith: one repository, npm workspaces `apps/api`, `apps/web`, `packages/shared`; API internally split into domain modules.
2. Microservices: separate auth, documents and sync services with their own databases.
3. Single package with folders, no workspace boundaries.
4. Turborepo/Nx/pnpm-based monorepo tooling.

## Decision Outcome

Chosen option: **1, modular monolith with npm workspaces**. `packages/shared` is a pure TypeScript library consumed by both apps; the API is split into `health`, `auth`, `audit`, `documents`, `collab` and `pending` modules with the dependency rules D1-D8 in the overview.

### Consequences

- Good: one `npm ci`, one typecheck, one test run; protocol changes are atomic across client and server.
- Good: no network hops between auth, documents and sync; a room can read session and membership data through in-process calls.
- Good: workspace boundaries make "shared must not import apps" mechanically checkable.
- Bad: one process means one failure domain; a crash drops every live room on the node (mitigated by persist-before-ack, [ADR-0021](0021-persist-before-ack-at-least-once.md)).
- Bad: scaling is whole-process; the sync tier cannot be scaled independently until QS-053/054.
- Neutral: npm workspaces lack task caching that Nx/Turborepo provide; acceptable at current size.

## Pros and Cons of the Options

- Microservices: independent scaling, but distributed transactions for "register = create org + owner", duplicated auth, and a network hop on every op. Rejected as premature.
- Single package: simplest, but nothing stops the CRDT from importing `pg` or DOM APIs. Rejected.
- Nx/Turborepo/pnpm: better caching; adds tooling surface and a second package manager convention. Rejected for now; revisit if CI exceeds 10 minutes.
