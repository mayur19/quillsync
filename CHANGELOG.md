# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-25

### Added

- Monorepo tooling: npm workspaces, strict TypeScript, ESLint, Prettier, `run.sh` launcher, CI on native PostgreSQL (QS-001 to QS-007, QS-013).
- Identity and access: organization-owner registration without account enumeration, Postgres sessions with scrypt and HMAC-hashed tokens, CSRF double submit, layered login throttling (per IP, distinct emails per IP, per-email progressive backoff), explicit `TRUST_PROXY`, RBAC matrix, audit log (QS-008 to QS-012).
- CRDT core: identifiers and state vectors, RGA integration with tombstones, causal readiness buffer, tree materialization, run-length compression and binary codec, garbage collection, anchors and text diff, convergence property tests (QS-020 to QS-027).
- Real-time sync: WebSocket protocol, rooms with a serialized queue, durable op log and rehydration, presence, document endpoints, web shell, plain-text collaborative editor with remote carets, reconnect and resend (QS-030 to QS-036).
- Documentation set: PRD, requirements, user stories, traceability, architecture, 21 ADRs, system design, data model, OpenAPI, threat model, test strategy, runbook, deployment, roadmap, backlog, implementation status, risks, glossary.
