# Operations runbook

Day-to-day operation of quillsync: configuration, local lifecycle with `run.sh`, health checks, logs, backup/restore, troubleshooting and incident handling. Production installation is covered in [deployment.md](deployment.md); the security context is in [../security/threat-model.md](../security/threat-model.md).

quillsync runs as native processes: one Node.js API process, static web files and a native PostgreSQL. Docker and other containers are not used.

## Configuration

The API reads environment variables (from `.env` in development, from `/etc/quillsync/api.env` in production) and validates them with zod at startup (`apps/api/src/config/env.ts`). An invalid value stops the process with a message naming the variable.

| Variable                     | Default                                | Description                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                   | `development`                          | `production` enables `Secure` cookies and production logging. `test` is set by the test runner.                                                                                               |
| `API_HOST`                   | `127.0.0.1`                            | Interface the API binds to. Keep loopback; nginx is the only public listener.                                                                                                                 |
| `API_PORT`                   | `4104`                                 | API port.                                                                                                                                                                                     |
| `WEB_PORT`                   | `5104`                                 | Vite dev server port (development only).                                                                                                                                                      |
| `APP_ORIGIN`                 | `http://localhost:5104`                | Exact origin of the web client. WebSocket upgrades whose `Origin` differs are refused with 403. In production: `https://<your host>` with no trailing slash.                                  |
| `DATABASE_URL`               | `postgres:///quillsync_dev?host=/tmp`  | PostgreSQL connection string. Local default uses the unix socket in `/tmp` and the OS user, no password.                                                                                      |
| `TEST_DATABASE_URL`          | `postgres:///quillsync_test?host=/tmp` | Database used by API integration tests. Must be a `_test` database.                                                                                                                           |
| `SESSION_SECRET`             | random, written by `run.sh setup`      | At least 32 characters. Required; startup fails if shorter.                                                                                                                                   |
| `SESSION_TTL_HOURS`          | `168`                                  | Absolute session lifetime (7 days).                                                                                                                                                           |
| `LOG_LEVEL`                  | `info`                                 | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`.                                                                                                                               |
| `LOGIN_EMAIL_FREE_ATTEMPTS`  | `5`                                    | Sign-in attempts per email before progressive lockout (30 s, doubling, max 15 min; forgotten after 24 h; reset on success).                                                                   |
| `LOGIN_IP_RATE_LIMIT_MAX`    | `30`                                   | Sign-in attempts per normalised client IP (IPv6 /64) per 15 minutes.                                                                                                                          |
| `LOGIN_EMAILS_PER_IP_MAX`    | `20`                                   | Distinct emails one normalised client IP may try per 15 minutes.                                                                                                                              |
| `REGISTER_IP_RATE_LIMIT_MAX` | `5`                                    | Registrations per client IP per hour.                                                                                                                                                         |
| `TRUST_PROXY`                | `false`                                | Which proxies may set the client IP: `false`, a hop count (`1` behind one nginx) or comma-separated proxy IPs/CIDRs. `true` is rejected. **Required in production** (startup fails if unset). |
| `WS_MAX_MESSAGE_BYTES`       | `262144`                               | Largest accepted WebSocket frame (256 KiB). Larger frames close the socket with code 1009.                                                                                                    |
| `DB_POOL_MAX`                | `10`                                   | Maximum PostgreSQL connections per API process.                                                                                                                                               |

## Local lifecycle with `run.sh`

| Command            | What it does                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./run.sh help`    | Lists subcommands.                                                                                                                                                                                                                                                           |
| `./run.sh setup`   | Checks Node ≥ 22 and PostgreSQL ≥ 15, runs `npm install`, writes `.env` from defaults with a random `SESSION_SECRET` (existing `.env` is kept), creates `quillsync_dev` and `quillsync_test` if missing, runs migrations.                                                    |
| `./run.sh migrate` | Applies pending migrations from `apps/api/migrations` to `DATABASE_URL`, verifying checksums of already-applied files.                                                                                                                                                       |
| `./run.sh seed`    | Loads demo data: "Northwind Editorial" (`northwind`), `ada@` (owner), `grace@` (editor), `linus@northwind.test` (viewer), password `quillsync-demo-1`, and documents "Q3 launch plan", "Style guide", "Interview notes" with op history from two replicas. Development only. |
| `./run.sh reset`   | Drops and recreates `quillsync_dev`, migrates and seeds. Destroys all local data.                                                                                                                                                                                            |
| `./run.sh test`    | Lint, typecheck and all Vitest suites against `quillsync_test`.                                                                                                                                                                                                              |
| `./run.sh dev`     | Starts the API on 4104 and the web dev server on 5104 (proxying `/api` and WebSocket upgrades to the API).                                                                                                                                                                   |
| `./run.sh`         | Default: `setup` then `dev`.                                                                                                                                                                                                                                                 |

Open `http://localhost:5104` and log in as `ada@northwind.test` / `quillsync-demo-1`.

## Health checks

| Check          | Command                                                                                                                                                                                                                                                      | Healthy                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Liveness       | `curl -fsS http://127.0.0.1:4104/api/health`                                                                                                                                                                                                                 | 200, `{"data":{"status":"ok",...},"error":null}`                                                      |
| Readiness      | `curl -fsS http://127.0.0.1:4104/api/ready`                                                                                                                                                                                                                  | 200; 503 means the database is unreachable                                                            |
| WebSocket path | `curl -s -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:4104/api/v1/documents/00000000-0000-0000-0000-000000000000/sync` | 401 (route reachable, no session). Through nginx the same check proves upgrade headers are forwarded. |
| Database       | `psql "$DATABASE_URL" -c 'select count(*) from documents'`                                                                                                                                                                                                   | Returns a row                                                                                         |
| Metrics        | `GET /api/metrics`                                                                                                                                                                                                                                           | Pending (QS-130); returns 501 today                                                                   |

Point the load balancer or monitor at `/api/ready`; use `/api/health` for process supervision.

## Logs

- The API logs pino JSON lines to stdout. Under systemd they go to the journal: `journalctl -u quillsync-api -f -o cat`.
- Pretty-print locally: `./run.sh dev | npx pino-pretty`.
- Each HTTP request gets a request id, logged as `reqId` on every line for that request and stored in `audit_log.request_id` for audited actions. Correlate a user report by time and path, then filter: `journalctl -u quillsync-api -o cat | grep '"reqId":"req-1a2b"'`.
- Useful fields: `level`, `time`, `reqId`, `req.method`, `req.url`, `res.statusCode`, `responseTime`, `err.type`, `err.stack` (server side only; responses carry the generic `INTERNAL` message).
- Collaboration events are logged with `documentId` and `clientId` (room loaded/unloaded, socket joined/left, batch persisted with op count, protocol errors). Document text is never logged.
- Raise verbosity temporarily with `LOG_LEVEL=debug` and a restart.

Audit trail: `psql "$DATABASE_URL" -c "select created_at, action, actor_user_id, target_type, target_id from audit_log order by id desc limit 20"`. The query API is pending (QS-019).

## Backup and restore

The op log is the source of truth for document content; there is no other copy outside open browser tabs. Back up the whole database.

Backup (custom format, compressed, consistent snapshot):

```bash
mkdir -p ~/backups && chmod 700 ~/backups
pg_dump --format=custom --no-owner --file ~/backups/quillsync_dev-$(date -u +%Y%m%dT%H%M%SZ).dump "postgres:///quillsync_dev?host=/tmp"
chmod 600 ~/backups/*.dump
```

Restore into a fresh database (never over a live one):

```bash
createdb -h /tmp quillsync_restore
pg_restore --no-owner --exit-on-error --dbname "postgres:///quillsync_restore?host=/tmp" ~/backups/quillsync_dev-20261124T090000Z.dump
psql "postgres:///quillsync_restore?host=/tmp" -c "select count(*) as docs from documents; select count(*) as batches from document_ops;"
```

Then stop the API, switch `DATABASE_URL` to `quillsync_restore` (or rename databases with `ALTER DATABASE ... RENAME`), run `./run.sh migrate` to apply anything newer than the dump, and start the API.

Verify a backup by restoring it and opening a document through `GET /api/v1/documents/{id}`: the materialized text proves the binary op payloads decode. Automated round-trip verification is pending (QS-064). Production schedule and retention are in [deployment.md](deployment.md).

## Troubleshooting

### Port already in use (4104 or 5104)

Symptom: `EADDRINUSE: address already in use 127.0.0.1:4104` or Vite reporting 5104 busy.

```bash
lsof -nP -iTCP:4104 -sTCP:LISTEN
lsof -nP -iTCP:5104 -sTCP:LISTEN
kill <pid>          # usually an orphaned earlier `run.sh dev`
```

Or set `API_PORT` / `WEB_PORT` in `.env`. If `WEB_PORT` changes, change `APP_ORIGIN` to match, or WebSocket upgrades will be refused.

### PostgreSQL socket not found in /tmp

Symptom: `connect ENOENT /tmp/.s.PGSQL.5432`.

- Check the server is running: `pg_isready -h /tmp`.
- macOS (Homebrew): `brew services start postgresql@16`. Linux packages often use `/var/run/postgresql`; either set `DATABASE_URL=postgres:///quillsync_dev?host=/var/run/postgresql` or add `/tmp` to `unix_socket_directories` in `postgresql.conf`.
- `role "<you>" does not exist`: `sudo -u postgres createuser --createdb "$USER"`.

### Migration checksum mismatch

Symptom: `migrate` or API startup fails with a checksum mismatch for an already-applied file such as `0002_documents_op_log.sql`.

Cause: an applied migration file was edited. Migrations are forward-only and immutable once applied.

Fix:

1. `git diff -- apps/api/migrations/` and restore the file: `git checkout -- apps/api/migrations/0002_documents_op_log.sql`.
2. Put the intended change in a new file with the next number (e.g. `0003_<name>.sql`) and run `./run.sh migrate`.
3. Locally only, if you deliberately rewrote unreleased migrations: `./run.sh reset`. Never do this against production.

### WebSocket 403 (Origin)

Symptom: the editor shows "reconnecting" forever; browser console shows the WebSocket handshake failing; API logs a refused upgrade with status 403.

Cause: `Origin` of the page is not exactly `APP_ORIGIN`. Common variants: `http://127.0.0.1:5104` vs `http://localhost:5104`, a changed `WEB_PORT`, `https://` vs `http://` behind a proxy, a trailing slash in `APP_ORIGIN`, or nginx not forwarding `Origin`.

Fix: open the app at the exact `APP_ORIGIN` or change `APP_ORIGIN` and restart the API. In production confirm nginx forwards the header (see [deployment.md](deployment.md)). A 401 instead of 403 means the session cookie is missing or expired: log in again.

### Stuck causal buffer

Symptom: one client's edits stop appearing for others while that client keeps getting `ack`s that do not advance for its own client id, or a document's text stops changing for everyone despite activity.

Background: an op is integrated only when it is causally ready (`seq == vector[client]+1` and its origin/target is present). Ops that are not ready wait in the room's pending buffer. A client that skipped a seq (bug) or a lost batch leaves later ops waiting.

Steps:

1. Compare vectors: the client's `ack.vector[clientId]` versus what the client believes it sent (browser devtools, WS frames).
2. Ask the user to reload the tab. On reconnect the client sends `hello` with its vector and resends every queued op the server does not cover; the gap closes if the missing op is still queued.
3. If the room itself is wedged, restarting the API unloads all rooms; on next join each room is rehydrated from `document_ops`, which contains only integrated ops, so the pending buffer is cleared. Connected clients reconnect automatically with backoff and resend.
4. Capture the client id, document id and frames for a bug report; the convergence property harness can replay the sequence.

Pending-buffer caps and per-connection rate limits are pending (QS-052).

### Room memory growth

Symptom: API RSS grows with one or two very active documents.

Background: a room holds the whole CRDT for its document in memory, including tombstones, from first join until the last socket leaves. Server-side tombstone GC and snapshots are pending (QS-060, QS-062), so heavily edited documents keep every deleted character.

Steps:

1. Find large documents: `psql "$DATABASE_URL" -c "select document_id, sum(op_count) ops, pg_size_pretty(sum(length(payload))) bytes from document_ops group by 1 order by 2 desc limit 10"`.
2. Check how many sockets are open: `GET /api/v1/documents/{id}/presence` per hot document.
3. Short term: schedule a restart in a quiet period (rooms rehydrate on demand). Consider raising the systemd `MemoryMax` only after checking host headroom.
4. Long term: QS-060 to QS-063.

## Incident checklist

1. **Declare**: note start time, symptom, who is handling it.
2. **Scope**: `/api/ready`; `systemctl status quillsync-api nginx postgresql`; `journalctl -u quillsync-api --since "-15 min" -o cat | grep '"level":50'` for errors.
3. **Stabilize**:
   - API down or crash-looping → check the last deploy; roll back per [deployment.md](deployment.md).
   - Database down → restart PostgreSQL; check disk space (`df -h`) and `pg_wal` growth.
   - Edits not syncing → WebSocket 403/401 checks above; nginx upgrade headers; stuck causal buffer.
   - Suspected compromise → rotate `SESSION_SECRET`, delete all rows from `sessions` (forces re-login), preserve logs and a database dump before changing anything else, and follow the security response in [../security/threat-model.md](../security/threat-model.md).
4. **Protect data**: take a `pg_dump` before any manual SQL. Never delete from `document_ops`; it is the only copy of document history.
5. **Communicate**: users see "reconnecting" during API restarts; their unacked edits stay queued in open tabs and resend on reconnect, so ask them not to close tabs during an outage (offline persistence to IndexedDB is pending, QS-120).
6. **Verify recovery**: health and readiness green; open a seeded or known document from two browsers and confirm edits converge.
7. **Follow up**: write a short post-incident note (timeline, cause, fix, follow-up tickets) and link new tickets in [../planning/backlog.md](../planning/backlog.md).
