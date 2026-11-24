# ADR-0002: Fastify 5 for HTTP and WebSocket

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-003, QS-030
- Related: [ADR-0019](0019-zod-at-every-boundary.md), [overview section 5](../architecture/overview.md#5-request-lifecycle-http)

## Context and Problem Statement

The API serves JSON routes and long-lived WebSocket sync connections from one process. It needs ordered request hooks (request id → session → CSRF → RBAC → validation), structured logging, and a WebSocket upgrade that can reuse the same session and permission checks.

## Decision Drivers

- Hook lifecycle that makes the security pipeline explicit and testable with `inject()`.
- First-class pino logging with per-request child loggers.
- WebSocket upgrade handled inside the same router so pre-upgrade checks share code with HTTP.
- Active maintenance on Node.js 22.

## Considered Options

1. Fastify 5 + `@fastify/websocket` (ws) + `@fastify/cookie`.
2. Express 5 + `ws` attached to the raw HTTP server.
3. Hono / Elysia style minimal routers.
4. Separate HTTP framework and standalone WebSocket server on another port.

## Decision Outcome

Chosen option: **1, Fastify 5**. Hooks implement the pipeline in order; `@fastify/websocket` routes (`GET /api/v1/documents/:id/sync`) run `preValidation` checks (Origin, session, document tenancy) before the upgrade completes; `fastify.inject()` drives API tests without opening ports.

### Consequences

- Good: the HTTP and WebSocket paths share the session resolver and RBAC guard.
- Good: request ids and pino child loggers are built in, giving `request_id` correlation into `audit_log`.
- Good: fast JSON serialization and low per-request overhead.
- Bad: plugin encapsulation rules (decorators and hooks are scoped) need care; cross-cutting hooks are registered at the root.
- Bad: Fastify's built-in JSON-schema validation is not used (zod is used instead), so validation is wired manually per route.

## Pros and Cons of the Options

- Express: familiar, but no ordered hook model or built-in logger; WebSocket upgrades bypass middleware so checks would be duplicated.
- Minimal routers: small and fast, thinner ecosystem for cookies and WebSocket on Node.
- Separate WebSocket server: isolates load, but needs its own session lookup and port, and complicates the Vite dev proxy.
