# ADR-0019: zod validation at every boundary

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-002, QS-003, QS-030
- Related: [ADR-0013](0013-json-text-frames-now-binary-later.md)

## Context and Problem Statement

Untrusted data enters through environment variables, HTTP requests, WebSocket frames, database rows decoded from bytea, and (on the client) API responses. TypeScript types vanish at run time. How is input validated?

## Decision Drivers

- One schema serving as runtime validator and static type.
- Shared between API and web without code duplication.
- Precise, user-presentable error details.

## Considered Options

1. zod schemas in `packages/shared/src/schemas` and `protocol/messages.ts`, parsed at each boundary; binary payloads validated by the codec's own bounds checks.
2. Fastify JSON Schema validation (Ajv) plus hand-written TypeScript types.
3. TypeBox or Valibot.

## Decision Outcome

Chosen option: **1**. `config/env.ts` parses env at start-up; every route parses params, query and body; `connection.ts` parses every frame; the web client parses responses and frames. Codec decoding throws `CodecError` on malformed bytes.

### Consequences

- Good: client and server agree on shapes by construction; `protocol.test.ts` exercises valid and invalid frames.
- Good: `VALIDATION_ERROR` details list issue paths.
- Bad: zod is slower than compiled Ajv validators; parse cost on the op path is O(frame size) and small next to persistence.
- Bad: Fastify's response serialization schemas are not used.

## Pros and Cons of the Options

- Ajv/JSON Schema: fastest, but types and schemas drift unless derived from one another, and the browser would need its own copy.
- TypeBox/Valibot: viable; zod chosen for ecosystem familiarity.
