# quillsync API guide

The machine-readable contract is [openapi.yaml](openapi.yaml) (OpenAPI 3.1). This guide covers the conventions behind it, the authentication flow, the WebSocket sync protocol and runnable `curl` examples.

Every operation in the spec carries `x-status: implemented` or `x-status: pending`. Pending routes are registered and answer `501 NOT_IMPLEMENTED` with the backlog ticket in `error.details.ticket` (see [../planning/backlog.md](../planning/backlog.md)). Of 47 operations, 11 are implemented and 36 are pending.

Related: [../architecture/overview.md](../architecture/overview.md), [../design/system-design.md](../design/system-design.md), [../design/data-model.md](../design/data-model.md), [../security/threat-model.md](../security/threat-model.md).

## Conventions

| Topic        | Rule                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base path    | `/api` for system endpoints (`/api/health`, `/api/ready`, `/api/metrics`); `/api/v1` for everything else.                                                                                                                                                    |
| Versioning   | The major version is in the path. Additive changes (new optional fields, new endpoints) stay in `v1`; removing or renaming a field, or tightening validation, requires `/api/v2`. The WebSocket protocol is versioned with the HTTP path it hangs off.       |
| Media type   | `application/json; charset=utf-8` for requests and responses, except `GET /documents/{id}/export` (Markdown/HTML), `POST /documents/import` (multipart) and `/api/metrics` (Prometheus text).                                                                |
| Identifiers  | Server entities use UUIDs (`organizations`, `users`, `documents`, `sessions`, ...). Audit event ids are `bigserial` serialized as strings. CRDT replicas use a random `clientId` string chosen per editor tab; CRDT items are identified by `{client, seq}`. |
| Timestamps   | RFC 3339 / ISO 8601 in UTC with milliseconds, e.g. `2026-11-24T09:15:02.481Z`. Field names end in `At`.                                                                                                                                                      |
| Field naming | `camelCase` in JSON; database columns are `snake_case`.                                                                                                                                                                                                      |
| Tenancy      | Every query is scoped to the organization of the current session. An id belonging to another organization yields `404 NOT_FOUND`, never `403`, so ids cannot be probed across tenants.                                                                       |
| Validation   | Request bodies, query strings, path parameters and WebSocket frames are validated with zod schemas from `packages/shared/src/schemas` and `packages/shared/src/protocol/messages.ts`. Unknown body properties are rejected.                                  |

### Response envelope

Every JSON response, success or failure, has the same shape:

```json
{ "data": { "id": "6a0d...", "title": "Q3 launch plan" }, "error": null }
```

```json
{
  "data": null,
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "This endpoint is planned but not implemented yet",
    "details": { "ticket": "QS-090" }
  }
}
```

List endpoints add `meta`:

```json
{ "data": [ ... ], "error": null, "meta": { "nextCursor": "eyJ1IjoiMjAyNi0xMS0yNFQwOToxNTowMi40ODFaIiwiaSI6IjZhMGQifQ", "limit": 25 } }
```

### Error codes

| HTTP | `error.code`        | Meaning                                                                                                                              | Typical cause                                                      |
| ---: | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
|  400 | `VALIDATION_ERROR`  | Input failed schema validation. `details.issues` lists `{path, message}`.                                                            | Missing title, malformed email, unknown property                   |
|  401 | `UNAUTHENTICATED`   | No session, unknown token, or expired session.                                                                                       | Cookie missing, `SESSION_TTL_HOURS` elapsed, logged out            |
|  403 | `CSRF_INVALID`      | Mutating request with a session but without a matching `x-csrf-token`.                                                               | Header missing or not equal to the `qs_csrf` cookie                |
|  403 | `FORBIDDEN`         | Authenticated, but the role lacks the permission; also WebSocket `Origin` mismatch.                                                  | Viewer calling `POST /documents`; viewer sending `ops`             |
|  404 | `NOT_FOUND`         | Resource absent or in another organization.                                                                                          | Stale document link                                                |
|  409 | `CONFLICT`          | Request conflicts with current state (planned endpoints).                                                                            | Demoting the last owner, folder cycle                              |
|  413 | `PAYLOAD_TOO_LARGE` | Request body over 1 MiB.                                                                                                             | Oversized JSON body                                                |
|  429 | `RATE_LIMITED`      | Too many attempts.                                                                                                                   | Login or registration throttles exceeded; `Retry-After` header set |
|  500 | `INTERNAL`          | Unexpected failure. The message is generic; the stack trace is in the server log under the request id.                               | Bug, database outage                                               |
|  501 | `NOT_IMPLEMENTED`   | Planned endpoint, not built. `details.ticket` = backlog ticket. Non-public pending routes return 401 first when there is no session. | Calling any `x-status: pending` route                              |
|  503 | `UNAVAILABLE`       | Readiness probe cannot reach PostgreSQL.                                                                                             | `GET /api/ready` during a database outage                          |

`/api/ready` returns 503 with the envelope when the database is unreachable.

### Pagination

List endpoints (`GET /documents`, `/folders`, `/members`, `/auth/sessions`, `/documents/{id}/versions`, `/documents/{id}/comments`, `/notifications`, `/search`, `/audit-events`) use keyset pagination:

- `limit` — 1 to 100, default 25.
- `cursor` — opaque string from `meta.nextCursor` of the previous page. Do not parse or construct it; its encoding may change within `v1`.
- `meta.nextCursor` is `null` on the last page.

Keyset cursors (sort key + id) keep pages stable while documents are being edited concurrently, unlike offsets.

## Authentication and CSRF

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API (Fastify)
    participant P as PostgreSQL
    B->>A: POST /api/v1/auth/login {email, password}
    A->>P: SELECT user; scrypt verify
    A->>P: INSERT sessions (token_hash = hmac_sha256(SESSION_SECRET, token), expires_at)
    A-->>B: 200 Me + Set-Cookie qs_session=token (HttpOnly) + qs_csrf=csrf
    B->>A: GET /api/v1/auth/me (cookie)
    A-->>B: 200 {user, organization, role, permissions, csrfToken}
    B->>A: POST /api/v1/documents (cookie + x-csrf-token)
    A->>A: compare header with qs_csrf cookie
    A-->>B: 201 Document
```

1. `POST /api/v1/auth/register` creates an organization, its owner and the owner membership and answers `202 {status: "accepted", message}`. The answer is identical when the email already exists (no account enumeration) and no cookies are set; the client then signs in. `POST /api/v1/auth/login` signs a user in and sets two cookies:
   - `qs_session` — random 32-byte token; `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`, lifetime `SESSION_TTL_HOURS` (default 168). The database stores only `HMAC-SHA256(SESSION_SECRET, token)`.
   - `qs_csrf` — CSRF token readable by the web client.
2. `GET /api/v1/auth/me` returns the user, organization, role, the role's permission list (from `packages/shared/src/rbac/permissions.ts`) and `csrfToken`.
3. Every `POST`, `PUT`, `PATCH` and `DELETE` made with a session must send `x-csrf-token: <csrfToken>`. A missing or mismatched header returns `403 CSRF_INVALID`. Register, login and password-reset requests are made without a session and do not need the header.
4. `POST /api/v1/auth/logout` deletes the session row and clears both cookies.

Roles and permissions:

| Role      | Permissions                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| owner     | all: `document:read`, `document:create`, `document:edit`, `document:comment`, `document:manage`, `member:manage`, `audit:read`, `workspace:manage` |
| editor    | `document:read`, `document:create`, `document:edit`, `document:comment`                                                                            |
| commenter | `document:read`, `document:comment`                                                                                                                |
| viewer    | `document:read`                                                                                                                                    |

## Rate limits and size limits

| Limit                         | Value                                                              | Behaviour                                                                | Status               |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------- |
| Login attempts per client IP  | `LOGIN_IP_RATE_LIMIT_MAX` (30) per 15 min; IPv6 grouped by /64     | `429 RATE_LIMITED` + `Retry-After`                                       | implemented (QS-010) |
| Distinct emails per client IP | `LOGIN_EMAILS_PER_IP_MAX` (20) per 15 min                          | `429 RATE_LIMITED`                                                       | implemented (QS-010) |
| Login attempts per email      | `LOGIN_EMAIL_FREE_ATTEMPTS` (5) free, then 30 s doubling to 15 min | `429 RATE_LIMITED`; reset on success; attempts reserved before any await | implemented (QS-010) |
| Registrations per client IP   | `REGISTER_IP_RATE_LIMIT_MAX` (5) per hour                          | `429 RATE_LIMITED`                                                       | implemented (QS-010) |

All throttle counters live in process memory (bounded stores that sweep expired entries and evict the active entry with the least time left when full); they move to PostgreSQL before more than one API instance runs (QS-053). The client IP comes from `TRUST_PROXY`.
| WebSocket frame size | `WS_MAX_MESSAGE_BYTES` (262144) | Socket closed with code 1009 (message too big) | implemented (QS-030) |
| Page size (`GET /documents`) | `limit` 1-100, default 50 | `400 VALIDATION_ERROR` above the maximum | implemented |
| Per-connection op rate and backpressure | — | | pending QS-052 |
| Password-reset requests | per IP + email | `429 RATE_LIMITED` | pending QS-015 |

## WebSocket sync protocol

Endpoint: `GET /api/v1/documents/{id}/sync` with WebSocket upgrade headers. In development the browser connects to `ws://localhost:5104/api/v1/documents/{id}/sync` and the Vite dev server proxies the upgrade to the API on port 4104.

### Handshake

The upgrade request is authorized before the protocol starts:

1. `qs_session` cookie must resolve to a live session, else `401`.
2. `Origin` must equal `APP_ORIGIN` exactly, else `403`. This blocks cross-site WebSocket hijacking: browsers attach `SameSite=Lax` cookies to cross-site WebSocket handshakes, so the cookie alone is not proof of a same-site page.
3. The session's membership must grant `document:read` on a document in the same organization, else `403`/`404`.

The role is fixed for the life of the socket. Owners and editors may send `ops`; commenters and viewers receive ops and presence but any `ops` frame they send is answered with `error` code `FORBIDDEN`. Re-checking permissions on live sockets after a role change is pending (QS-056).

### Frames

All frames are JSON text, discriminated by `type`; schemas are `ClientMessage` and `ServerMessage` in [openapi.yaml](openapi.yaml) (also listed under `x-websocket-messages`).

| Direction | `type`      | Fields                               | Purpose                                                                                                                                                                                                                                                     |
| --------- | ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C→S       | `hello`     | `clientId`, `vector`                 | Must be the first frame, sent once. Declares the replica id and what the client already has; the display name comes from the session.                                                                                                                       |
| C→S       | `ops`       | `runs`                               | Locally created runs. Every run's `client` must equal the `hello` `clientId`.                                                                                                                                                                               |
| C→S       | `presence`  | `anchor`, `focused`                  | Caret position as a CRDT anchor.                                                                                                                                                                                                                            |
| C→S       | `ping`      | —                                    | Keep-alive.                                                                                                                                                                                                                                                 |
| S→C       | `welcome`   | `vector`, `runs`, `peers`, `canEdit` | Delta the client is missing, current peers, and whether this role may send `ops`.                                                                                                                                                                           |
| S→C       | `ops`       | `runs`, `from`                       | Fan-out of another replica's newly integrated runs.                                                                                                                                                                                                         |
| S→C       | `ack`       | `vector`                             | Server vector after the client's batch was integrated and persisted.                                                                                                                                                                                        |
| S→C       | `presence`  | `peer`                               | A peer joined or moved its caret.                                                                                                                                                                                                                           |
| S→C       | `peer-left` | `clientId`                           | A peer's socket closed.                                                                                                                                                                                                                                     |
| S→C       | `error`     | `code`, `message`                    | `BAD_MESSAGE` (malformed, binary or repeated `hello`), `NOT_READY` (no `hello` yet), `FORBIDDEN` (read-only role), `CLIENT_MISMATCH` (run from another client id), `INVALID_OP`, `CAUSALITY_VIOLATION` (batch depends on ops the server lacks), `INTERNAL`. |
| S→C       | `pong`      | —                                    | Reply to `ping`.                                                                                                                                                                                                                                            |

Runs are the run-length compressed form of CRDT ops:

- `InsertRun` `{k:'i', client, seq, lamport, origin, text}` — character `i` of `text` has id `{client, seq+i}` and Lamport `lamport+i`; its origin is the previous character of the run, and the first character's origin is `origin` (`{client, seq}` of the nearest visible character to its left when typed, or `null` for the document start).
- `DeleteRun` `{k:'d', client, seq, lamport, targets:[{client, seq, len}]}` — delete op `j` has id `{client, seq+j}`; `targets` lists the item ranges being tombstoned.

### Walkthrough

Ada (client `k3f9a1`) opens "Style guide", which already contains `Hi` written by replica `p0x7qz`. Grace (client `w8m2rt`) is already connected.

1. Ada connects with an empty vector:

   ```json
   { "type": "hello", "clientId": "k3f9a1", "vector": {} }
   ```

2. The server joins (or rehydrates from `document_ops`) the room and replies with everything Ada lacks:

   ```json
   {
     "type": "welcome",
     "vector": { "p0x7qz": 2 },
     "runs": [
       { "k": "i", "client": "p0x7qz", "seq": 1, "lamport": 1, "origin": null, "text": "Hi" }
     ],
     "peers": [
       {
         "clientId": "w8m2rt",
         "userId": "3b1e...",
         "displayName": "Grace",
         "color": "#2f7ed8",
         "anchor": { "client": "p0x7qz", "seq": 2 },
         "focused": true
       }
     ],
     "canEdit": true
   }
   ```

   Grace receives `{"type":"presence","peer":{"clientId":"k3f9a1",...}}`.

3. Ada types `!` after `i`. The editor's prefix/suffix diff becomes one insert whose origin is `i` = `{p0x7qz,2}`; its Lamport is one more than the highest seen:

   ```json
   {
     "type": "ops",
     "runs": [
       {
         "k": "i",
         "client": "k3f9a1",
         "seq": 1,
         "lamport": 3,
         "origin": { "client": "p0x7qz", "seq": 2 },
         "text": "!"
       }
     ]
   }
   ```

4. The room queue integrates the run, persists it as one `document_ops` row (binary codec in `payload`), then acks Ada and fans out to Grace:

   ```json
   { "type": "ack", "vector": { "p0x7qz": 2, "k3f9a1": 1 } }
   ```

   ```json
   {
     "type": "ops",
     "runs": [
       {
         "k": "i",
         "client": "k3f9a1",
         "seq": 1,
         "lamport": 3,
         "origin": { "client": "p0x7qz", "seq": 2 },
         "text": "!"
       }
     ],
     "from": "k3f9a1"
   }
   ```

5. Ada deletes `H`:

   ```json
   {
     "type": "ops",
     "runs": [
       {
         "k": "d",
         "client": "k3f9a1",
         "seq": 2,
         "lamport": 4,
         "targets": [{ "client": "p0x7qz", "seq": 1, "len": 1 }]
       }
     ]
   }
   ```

6. Ada moves her caret; anchors name the character to the left so they survive concurrent edits:

   ```json
   { "type": "presence", "anchor": { "client": "k3f9a1", "seq": 1 }, "focused": true }
   ```

7. Ada's network drops. She keeps typing; the ops queue locally. On reconnect (exponential backoff 0.5 s to 10 s with jitter) she sends `hello` with her current vector, receives `welcome` with what she missed, and resends every queued op the server vector does not cover. Already-integrated ops (`seq <= vector[client]`) are dropped by the server, so resending is safe.

8. When Ada closes the tab, Grace receives `{"type":"peer-left","clientId":"k3f9a1"}`. When the last socket leaves, the room is unloaded.

### Delivery guarantees

- Ops are idempotent and order-insensitive: a run whose ops are not yet causally ready (missing predecessor seq, or missing origin/target) waits in the room's pending buffer until its dependencies arrive.
- `ack` is sent only after the batch is committed to PostgreSQL. An unacked op may or may not be durable; the client keeps it queued and resends it.
- Fan-out reaches sockets on the same process only. Multi-process fan-out is pending (QS-053, QS-054); run a single API process until then.

## curl examples

Run against a local API started with `./run.sh` (listening on `http://127.0.0.1:4104`). The cookie jar stores `qs_session` and `qs_csrf`.

```bash
API=http://127.0.0.1:4104
JAR=$(mktemp)

# Register a new organization + owner (202, no cookies; sign in afterwards)
curl -s -X POST "$API/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d '{"organizationName":"Acme Docs","displayName":"Mia","email":"mia@acme.test","password":"correct-horse-battery"}'
# {"data":{"status":"accepted","message":"If this email address can be used, your workspace is ready. Sign in to continue."},"error":null}

# Or log in as the seeded owner
curl -s -c "$JAR" -b "$JAR" -X POST "$API/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"ada@northwind.test","password":"quillsync-demo-1"}'

# Who am I? Capture the CSRF token
CSRF=$(curl -s -b "$JAR" "$API/api/v1/auth/me" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.csrfToken))')
echo "csrf=$CSRF"

# Create a document (mutating: needs x-csrf-token)
DOC=$(curl -s -b "$JAR" -X POST "$API/api/v1/documents" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"title":"Release notes"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.id))')

# Read it back: metadata + text + vector + opCount
curl -s -b "$JAR" "$API/api/v1/documents/$DOC"
# {"data":{"id":"...","title":"Release notes","text":"","vector":{},"opCount":0,...},"error":null}

# Same request without the CSRF header is refused
curl -s -b "$JAR" -X POST "$API/api/v1/documents" -H 'content-type: application/json' -d '{"title":"x"}'
# {"data":null,"error":{"code":"CSRF_INVALID","message":"..."}}

# A pending endpoint answers 501 with its ticket
curl -s -i -b "$JAR" "$API/api/v1/folders"
# HTTP/1.1 501 Not Implemented
# {"data":null,"error":{"code":"NOT_IMPLEMENTED","message":"...","details":{"ticket":"QS-090"}}}

# Log out
curl -s -b "$JAR" -c "$JAR" -X POST "$API/api/v1/auth/logout" -H "x-csrf-token: $CSRF"
```

To exercise the WebSocket by hand, any client that can send cookies and an `Origin` header works, for example with `websocat`:

```bash
TOKEN=$(awk '$6=="qs_session"{print $7}' "$JAR")
websocat -H "Cookie: qs_session=$TOKEN" -H "Origin: http://localhost:5104" \
  "ws://127.0.0.1:4104/api/v1/documents/$DOC/sync"
{"type":"hello","clientId":"cli1abcd","vector":{}}
```

Omitting the `Origin` header, or sending a different one, fails the upgrade with 403; no session gives 401 and a document in another organization 404.
