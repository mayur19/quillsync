# ADR-0017: Postgres-backed sessions, scrypt password hashing, CSRF double submit

- Status: Accepted
- Date: 2026-11-24
- Tickets: QS-008, QS-009, QS-010, QS-016
- Related: [overview section 5](../architecture/overview.md#5-request-lifecycle-http)

## Context and Problem Statement

The SPA and API share an origin (via the Vite proxy in development and a reverse proxy in production). How are users authenticated, how are passwords stored, and how are cookie-authenticated requests protected from cross-site forgery?

## Decision Drivers

- Immediate revocation (logout, future session management QS-016, permission changes QS-056).
- No secrets in browser-readable storage.
- Use only Node.js built-ins for crypto.
- WebSocket upgrade must authenticate with the same credential.

## Considered Options

1. Opaque random session token in an HttpOnly cookie; HMAC-SHA256 (keyed by SESSION_SECRET) of the token stored in `sessions`; scrypt for passwords; CSRF double-submit cookie `qs_csrf` + header `x-csrf-token`.
2. Stateless JWT in a cookie or `Authorization` header.
3. bcrypt or argon2 via native modules.
4. Synchronizer-token CSRF stored server-side per session.

## Decision Outcome

Chosen option: **1**. Login creates a 32-byte random token; the cookie `qs_session` (HttpOnly, SameSite=Lax, Secure in production, lifetime `SESSION_TTL_HOURS` = 168) carries it; `sessions.token_hash` stores HMAC-SHA256 (keyed by `SESSION_SECRET`) so a database read does not reveal usable tokens. Passwords use salted scrypt from `node:crypto`. Unsafe methods on authenticated requests require `qs_csrf` cookie == `x-csrf-token` header; the token is also returned by `GET /auth/me`. Login is rate limited per (ip, email).

### Consequences

- Good: logout and revocation are a row delete; the WebSocket upgrade reuses the same lookup.
- Good: no native modules; scrypt is memory-hard.
- Good: SameSite=Lax plus double submit covers both classic CSRF and same-site subdomain attacks on unsafe methods.
- Bad: one indexed lookup per request (`token_hash` unique index).
- Bad: double submit relies on attackers being unable to write cookies for our origin; HTTPS and a dedicated host are deployment requirements (QS-137).

## Pros and Cons of the Options

- JWT: no lookup, but no revocation without a denylist and larger cookies.
- bcrypt/argon2 native modules: well known, but native build steps in CI and on developer machines.
- Synchronizer token: strong, but extra server state for little gain over double submit with SameSite cookies.

## Implementation note

The CSRF token is derived as `HMAC-SHA256(SESSION_SECRET, "csrf:" + sessionToken)`. It is delivered in the readable `qs_csrf` cookie and in `GET /api/v1/auth/me`, and the server compares the `x-csrf-token` header against the value derived from the current session (constant-time), so nothing extra is stored and a token from one session is useless with another. Registration no longer signs the user in (it answers an identical 202 for new and existing emails to avoid account enumeration); the session is created by the following login.
