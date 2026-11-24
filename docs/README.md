# quillsync documentation

quillsync is a real-time collaborative document editor built on an in-house sequence CRDT (RGA with Lamport timestamps, causal delivery, run-length binary encoding). This folder holds the product, architecture, design, API, security, testing, operations and planning documents. Ticket IDs (`QS-xxx`) refer to [planning/backlog.md](planning/backlog.md), the single source of truth for scope, estimates and status; requirement IDs (FR/NFR) refer to [product/requirements.md](product/requirements.md).

## Index

### Product

| Document                                                                     | Description                                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [product/PRD.md](product/PRD.md)                                             | Product requirements: problem, target users, goals, scope and non-goals.                 |
| [product/requirements.md](product/requirements.md)                           | Numbered functional (FR) and non-functional (NFR) requirements with acceptance criteria. |
| [product/user-stories.md](product/user-stories.md)                           | User stories per persona (owner, editor, commenter, viewer) linked to requirements.      |
| [product/requirements-traceability.md](product/requirements-traceability.md) | Requirement → ticket → code → test mapping with implementation status.                   |

### Architecture and design

| Document                                                                 | Description                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md)                     | System context and component view of the modular monolith (API, web, shared, PostgreSQL).         |
| [architecture/quality-attributes.md](architecture/quality-attributes.md) | Quality attribute scenarios: convergence, latency, durability, availability, security.            |
| [adr/README.md](adr/README.md)                                           | Index of architecture decision records (in-house CRDT, op log in PostgreSQL, no containers, ...). |
| [design/system-design.md](design/system-design.md)                       | CRDT algorithms and complexity, sync protocol, rooms, persistence and GC design.                  |
| [design/data-model.md](design/data-model.md)                             | Database schema: migrated tables and planned tables with columns and constraints.                 |

### API

| Document                             | Description                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [api/openapi.yaml](api/openapi.yaml) | OpenAPI 3.1 contract for all 47 operations (11 implemented, 36 pending with tickets) and the WebSocket message schemas. |
| [api/README.md](api/README.md)       | API conventions, error codes, pagination, auth and CSRF flow, WebSocket walkthrough, curl examples.                     |

### Security, testing, operations

| Document                                             | Description                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [security/threat-model.md](security/threat-model.md) | Assets, actors, trust boundaries, STRIDE per component, mitigations with status, OWASP ASVS mapping, residual risks.                   |
| [testing/test-strategy.md](testing/test-strategy.md) | Test pyramid, convergence property tests, integration against real PostgreSQL, coverage gates, acceptance matrix, CI and flake policy. |
| [operations/runbook.md](operations/runbook.md)       | Configuration reference, `run.sh` lifecycle, health checks, logs, backup/restore, troubleshooting, incident checklist.                 |
| [operations/deployment.md](operations/deployment.md) | Single-host deployment with systemd, nginx (WebSocket proxying), native PostgreSQL, TLS, release and rollback.                         |

### Planning

| Document                                                               | Description                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [planning/roadmap.md](planning/roadmap.md)                             | Milestones M0–M8 and the epics and tickets each one delivers.                |
| [planning/backlog.md](planning/backlog.md)                             | All tickets with epic, milestone, estimate, status and dependencies.         |
| [planning/implementation-status.md](planning/implementation-status.md) | What is built versus planned, with percentages derived from backlog hours.   |
| [planning/risks.md](planning/risks.md)                                 | Project and technical risk register with likelihood, impact and mitigations. |

### Reference

| Document                   | Description                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [glossary.md](glossary.md) | Terms used across the docs: replica, item id, origin, tombstone, state vector, causal stability, run, room. |

## Suggested reading order

1. **Orientation**: [product/PRD.md](product/PRD.md) → [planning/implementation-status.md](planning/implementation-status.md) → [glossary.md](glossary.md).
2. **How it works**: [architecture/overview.md](architecture/overview.md) → [design/system-design.md](design/system-design.md) → [design/data-model.md](design/data-model.md) → [adr/README.md](adr/README.md).
3. **What it must do**: [product/requirements.md](product/requirements.md) → [product/user-stories.md](product/user-stories.md) → [architecture/quality-attributes.md](architecture/quality-attributes.md) → [product/requirements-traceability.md](product/requirements-traceability.md).
4. **Building against it**: [api/README.md](api/README.md) → [api/openapi.yaml](api/openapi.yaml).
5. **Trusting it**: [security/threat-model.md](security/threat-model.md) → [testing/test-strategy.md](testing/test-strategy.md).
6. **Running it**: [operations/runbook.md](operations/runbook.md) → [operations/deployment.md](operations/deployment.md).
7. **What comes next**: [planning/roadmap.md](planning/roadmap.md) → [planning/backlog.md](planning/backlog.md) → [planning/risks.md](planning/risks.md).

Shortcuts by role: new contributors read 1, 2, 4 and the runbook; operators read the runbook, deployment and threat model; reviewers of a pending ticket read its row in the backlog, the matching section of the system design, and the acceptance matrix in the test strategy.
