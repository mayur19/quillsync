# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's "Report a vulnerability" (Security Advisories) on this repository rather than in a public issue. Include steps to reproduce, affected versions or commits, and impact. You can expect an acknowledgement within 5 working days.

## Supported versions

Only the latest `main` is supported while the project is pre-1.0.

## Security model summary

- Sessions: random 32-byte tokens in HttpOnly, SameSite=Lax cookies; only an HMAC-SHA256 of the token is stored. Passwords use scrypt.
- CSRF: double-submit token bound to the session on every authenticated mutating request; WebSocket upgrades require `Origin` to equal `APP_ORIGIN`.
- Throttling: per-IP, distinct-emails-per-IP and per-email progressive backoff on sign-in; per-IP limit on registration; registration does not reveal whether an email exists. Counters are in memory (single instance) and move to PostgreSQL before multi-instance deployment.
- Tenancy: every query is scoped by `organization_id` in the repository layer; other tenants' documents answer 404.
- Untrusted CRDT input: frames are size-limited and zod-validated; runs must belong to the connection's client id; batches with invalid stamps or missing causal dependencies are rejected without being persisted.

The full analysis is in [docs/security/threat-model.md](docs/security/threat-model.md).
