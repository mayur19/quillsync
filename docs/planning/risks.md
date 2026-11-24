# Risk register

This register covers delivery, technical and security risks for quillsync. Review it at every milestone exit (see [roadmap.md](roadmap.md)). Ticket and requirement IDs refer to [backlog.md](backlog.md) and [../product/requirements.md](../product/requirements.md).

**Scales**

- **Likelihood:** Low (under 20 %), Medium (20 to 50 %), High (over 50 %) within the remaining plan.
- **Impact:** Low (minor rework), Medium (milestone slip of a week or less, or a degraded NFR), High (data loss or divergence, a security breach, or a milestone slip of more than a week).
- **Score:** L × I, with L, M and H counted as 1, 2 and 3.
- **Owner roles:** _CRDT lead_ (owns `packages/shared/src/crdt`), _Sync lead_ (owns `apps/api/src/modules/collab` and `apps/web/src/collab`), _Product lead_, _Security reviewer_, _Operator_ (deployment and runbooks). With a team of two engineers, one person holds several roles.

## Summary

| ID   | Risk                                                                      | L   | I   | Score | Owner             | Status                             |
| ---- | ------------------------------------------------------------------------- | --- | --- | ----: | ----------------- | ---------------------------------- |
| R-01 | Tombstone growth without bound                                            | H   | M   |     6 | CRDT lead         | Open (L3 in implementation-status) |
| R-02 | GC removes a tombstone an offline replica still references                | M   | H   |     6 | CRDT lead         | Open, mitigated in design          |
| R-03 | Interleaving anomalies in new op types (marks, blocks, moves)             | M   | H   |     6 | CRDT lead         | Open                               |
| R-04 | Causal buffer stalls on a missing dependency                              | M   | M   |     4 | Sync lead         | Open                               |
| R-05 | Memory per room exceeds host capacity                                     | M   | H   |     6 | Sync lead         | Open                               |
| R-06 | Wall-clock assumptions creep into ordering                                | L   | H   |     3 | CRDT lead         | Mitigated                          |
| R-07 | Rich-text editor surface (IME, selection) takes far longer than estimated | H   | H   |     9 | Sync lead         | Open                               |
| R-08 | Accessibility of a custom contenteditable editor                          | M   | M   |     4 | Product lead      | Open                               |
| R-09 | Split brain with multiple API processes before QS-053 and QS-054          | M   | H   |     6 | Operator          | Open (L1)                          |
| R-10 | Cold load slows down as op logs grow                                      | H   | M   |     6 | Sync lead         | Open (L2)                          |
| R-11 | Malicious or buggy client sends hostile ops                               | M   | H   |     6 | Security reviewer | Partly mitigated                   |
| R-12 | Permission revocation not applied to open sockets                         | H   | M   |     6 | Security reviewer | Open (L9)                          |
| R-13 | Offline edits lost on reload                                              | H   | M   |     6 | Sync lead         | Open (L5)                          |
| R-14 | Version restore or comment anchors break after compaction or GC           | M   | H   |     6 | CRDT lead         | Open                               |
| R-15 | Scan integration is O(n) and unacceptable on large documents              | M   | M   |     4 | CRDT lead         | Open (L6)                          |
| R-16 | Estimate overrun with a two-person team (bus factor)                      | H   | M   |     6 | Product lead      | Open                               |
| R-17 | XSS through imported Markdown, links or HTML export                       | M   | H   |     6 | Security reviewer | Open                               |
| R-18 | Postgres op-log write throughput becomes the bottleneck                   | L   | M   |     2 | Sync lead         | Open                               |

## Detail

### R-01: Tombstone growth without bound

- **Description:** deletes leave tombstones (FR-019). Until server-side GC (QS-062) is wired, no tombstone is ever collected. A heavily rewritten document can carry 10× more tombstones than visible characters, and each costs memory in the room and bytes in every snapshot.
- **Likelihood / impact:** High / Medium.
- **Mitigation:** deliver QS-062 and QS-063 in M2, the first pending milestone. Expose the `quillsync_tombstones` metric (QS-130) and show the tombstone ratio in the admin console (QS-136). NFR-013 sets the target (20 % or less after 30 days).
- **Trigger:** tombstone ratio above 50 % on any seeded or production document, or room heap above the NFR-012 budget.
- **Owner:** CRDT lead.

### R-02: GC removes a tombstone an offline replica still references

- **Description:** a replica that has been offline for days may later send an insert whose `origin` is a tombstone, or a delete that targets one. If GC removed that item, the op can never become causally ready and stalls in the pending buffer (R-04), or the ops are integrated at the wrong position.
- **Likelihood / impact:** Medium / High (divergence or a stuck replica).
- **Mitigation:** GC collects only tombstones whose delete is **causally stable**, meaning it is covered by the pointwise minimum of _all_ tracked replicas' acknowledged vectors, and that have **no retained children** (FR-023). Offline replicas therefore hold back the frontier. To stop one stale replica from blocking GC forever, QS-063 evicts replicas silent past a configured window and forces them to resync from a snapshot, re-applying their unacknowledged local ops as fresh inserts (FR-053). The property tests in `packages/shared/test/crdt/gc.test.ts` already cover "GC then late op". They will be extended with eviction and resync scenarios.
- **Trigger:** any op from a reconnecting client that references an unknown ItemId below the server's compaction point. This is logged with a metric and answered with `RESYNC_REQUIRED`.
- **Owner:** CRDT lead.

### R-03: Interleaving anomalies in new op types

- **Description:** the current RGA prevents interleaving of concurrently typed runs (NFR-002) because each character's origin is the previous character of its run. Marks (QS-040), block splits and merges (QS-041), moves (QS-042) and undo (QS-044) bring new concurrency cases. Examples: concurrent bold and unbold at overlapping boundaries, splitting a block while another user merges it, or two moves of the same block. These can produce non-convergent or surprising results. Known anomalies in the literature include interleaving under backward typing and duplication under concurrent moves.
- **Likelihood / impact:** Medium / High.
- **Mitigation:** every new op type must be added to `convergence.property.test.ts` before its ticket can be marked done. Moves use a single last-writer-wins position keyed by (lamport, client) so a block cannot be duplicated (FR-027). Mark-boundary behaviour is specified per mark (FR-025). The large-scale fuzzing harness (QS-045) runs 10^6 ops across 8 replicas.
- **Trigger:** any failing property seed, or any user report of text scrambled at a shared insertion point.
- **Owner:** CRDT lead.

### R-04: Causal buffer stalls

- **Description:** an op waits in the pending buffer until `seq == vector[client] + 1` and its origin or target exists (FR-020). If a predecessor op is lost, for example because a client crashed between sending batch n+1 and persisting batch n, every later op from that client stalls indefinitely and the buffer grows.
- **Likelihood / impact:** Medium / Medium.
- **Mitigation:** the server persists before acknowledging (NFR-011). Clients resend everything the server's vector does not cover on reconnect (FR-041). Each room bounds the buffer by op count and age. When a buffer entry is older than 30 s, the server sends `welcome`-style resync to the originating client. The buffer size is exposed as a metric (FR-088).
- **Trigger:** a pending-buffer entry older than 30 s, or more than 1,000 buffered ops in a room.
- **Owner:** Sync lead.

### R-05: Memory per room exceeds host capacity

- **Description:** each loaded room holds every item, including tombstones, in memory as objects with an ID, origin, Lamport timestamp and flags. One object per character is heap-heavy. With L1 (single node), every active document competes for one heap.
- **Likelihood / impact:** Medium / High (an out-of-memory crash drops every room).
- **Mitigation:** unload idle rooms (already done). GC of tombstones (QS-062). Compact the in-memory representation with the B-tree and run-based leaves (QS-043). Benchmark to the NFR-012 budget of 200 bytes or less per item (QS-045). Cap loaded rooms per process, with LRU unload.
- **Trigger:** heap above 70 % of `--max-old-space-size` for 5 minutes, or the benchmark showing more than 200 bytes per item.
- **Owner:** Sync lead.

### R-06: Wall-clock assumptions creep into ordering

- **Description:** convergence relies only on Lamport timestamps and client IDs (NFR-004). Clock skew between clients is therefore irrelevant to correctness. The risk is that a future feature (version checkpoints, comment ordering, last-writer-wins attributes, retention) uses `Date.now()` from clients to order CRDT state, which would make convergence depend on skew.
- **Likelihood / impact:** Low / High.
- **Mitigation:** a lint rule bans `Date` in `packages/shared/src/crdt`. Last-writer-wins attributes (block type, move position) order by (lamport, client), never by wall time. Wall-clock timestamps are used only for display and for server-side retention, using server time.
- **Trigger:** a code review finding of `Date` or `performance.now` in CRDT code, or a property test that depends on timing.
- **Owner:** CRDT lead.

### R-07: Rich-text editor surface overruns its estimate

- **Description:** QS-050 (56 h) covers contenteditable, IME composition, selection mapping and DOM reconciliation across three browser engines. These are notoriously hard and sit on the critical path (QS-040 → QS-041 → QS-050).
- **Likelihood / impact:** High / High.
- **Mitigation:** spike IME and selection handling in the first week of M3. Keep the plain-text editor shippable as a fallback behind a flag. Keep the model-to-DOM layer thin and test it with recorded composition event traces. Start the E2E matrix (QS-134) for the editor early, even if it runs locally only.
- **Trigger:** QS-050 burn above 50 % of its estimate with composition tests still failing in any engine.
- **Owner:** Sync lead.

### R-08: Accessibility of a custom editor

- **Description:** custom contenteditable editors often break screen-reader navigation, and remote carets or presence can create noise. NFR-021 requires WCAG 2.1 AA.
- **Likelihood / impact:** Medium / Medium.
- **Mitigation:** design ARIA roles with QS-050 rather than retrofitting them in QS-133. Render remote carets with `aria-hidden` and announce presence through a polite live region. Run axe checks in E2E from M3 onward.
- **Trigger:** axe serious or critical violations in the editor, or a failed manual pass with VoiceOver or NVDA.
- **Owner:** Product lead.

### R-09: Split brain with multiple API processes

- **Description:** rooms are in memory per process (L1). If an operator runs two processes behind a load balancer before QS-053 and QS-054, editors of one document land in different rooms. Ops persist and converge eventually, but live editors diverge until they reconnect.
- **Likelihood / impact:** Medium / High.
- **Mitigation:** documentation and `run.sh` state single-process operation. The readiness endpoint could report a room-ownership mode. QS-054 uses Postgres advisory locks so only one node owns a room, with failover within 10 s (NFR-033).
- **Trigger:** more than one API process connected to the same database (visible in `pg_stat_activity` application name).
- **Owner:** Operator.

### R-10: Cold load slows as op logs grow

- **Description:** without snapshots (L2), the first join replays every `document_ops` row.
- **Likelihood / impact:** High / Medium.
- **Mitigation:** QS-060 and QS-061 in M2. Use timestamp-tree batch materialization (already O(n log n), FR-021) to keep replay bounded in the meantime.
- **Trigger:** p95 first-join time above 500 ms (NFR-014) on any document.
- **Owner:** Sync lead.

### R-11: Hostile ops from a client

- **Description:** an authenticated editor's client (malicious or buggy) can send ops with forged client IDs, huge runs, references to non-existent origins, or seq gaps intended to fill the pending buffer.
- **Likelihood / impact:** Medium / High.
- **Mitigation:** already in place: zod validation of every frame, the 256 KiB frame cap and `CodecError` on malformed binary (NFR-005, NFR-019). Planned: bind each socket to the client ID declared in `hello` and reject ops for other clients, cap the pending buffer per socket, and add per-connection op rate limits (QS-052, NFR-035).
- **Trigger:** more than 100 `error` frames per minute on one socket, or pending-buffer cap hits.
- **Owner:** Security reviewer.

### R-12: Revocation not applied to open sockets

- **Description:** permissions are evaluated on WebSocket upgrade only (L9). A removed or downgraded user keeps editing until they reconnect.
- **Likelihood / impact:** High (it happens today on every role change) / Medium.
- **Mitigation:** QS-056 re-evaluates permissions on membership or grant change events and closes or downgrades sockets within 5 s (NFR-036). Until then, revoking sessions (QS-016) is the administrative workaround once it exists. Today the only workaround is restarting the process.
- **Trigger:** any role change in an organization with active rooms.
- **Owner:** Security reviewer.

### R-13: Offline edits lost on reload

- **Description:** pending ops live in tab memory (L5). Users may believe their work is saved.
- **Likelihood / impact:** High / Medium (user data loss, though small in scope).
- **Mitigation:** QS-120 (IndexedDB) and QS-121 (an unsynced-changes indicator). As an interim measure, add a `beforeunload` prompt when the outbound queue is non-empty (small change, tracked under QS-121).
- **Trigger:** user reports, or the outbound queue being non-empty at unload.
- **Owner:** Sync lead.

### R-14: Restore or anchors break after compaction or GC

- **Description:** version restore (QS-073) needs the item set at a past vector. Comment anchors (QS-081) reference ItemIds that may be tombstoned. Compaction (QS-061) and GC (QS-062) could remove what either one needs.
- **Likelihood / impact:** Medium / High.
- **Mitigation:** compaction keeps every snapshot referenced by a retained version. GC treats anchors referenced by open comment threads as retained children. Anchors fall back to the nearest surviving left neighbour and record the quoted text (FR-062). Cross-feature tests are part of the M6 exit criteria.
- **Trigger:** any restore or anchor resolution that fails or returns `NOT_FOUND` for an ItemId.
- **Owner:** CRDT lead.

### R-15: O(n) integration on large documents

- **Description:** scan integration is O(n) per op (L6). On a document of 10^6 items, a burst of remote ops could block the event loop.
- **Likelihood / impact:** Medium / Medium.
- **Mitigation:** batches larger than 32 ops already use the O((n+k) log(n+k)) tree rebuild. QS-043 adds an order-statistic B-tree (NFR-008).
- **Trigger:** event-loop lag above 50 ms attributable to integration.
- **Owner:** CRDT lead.

### R-16: Estimate overrun with a two-person team

- **Description:** 1028 h remain against about 1150 h of capacity (13 % slack). Illness or attrition of one engineer halves throughput, and knowledge of the CRDT internals is concentrated.
- **Likelihood / impact:** High / Medium.
- **Mitigation:** pair on the CRDT and sync modules, keep the CRDT and protocol design documentation current, and hold M9 as a buffer. Descoping order if needed: Could items first (FR-031, FR-043, FR-046, FR-047, FR-049, FR-060, FR-066, FR-067, FR-072 to FR-074, FR-079, FR-084, FR-087, FR-092, FR-094).
- **Trigger:** any milestone finishing more than 20 % over its hour budget.
- **Owner:** Product lead.

### R-17: XSS through import, links or export

- **Description:** imported Markdown (QS-112), link marks (QS-040) and HTML export (QS-111) can carry `javascript:` URLs or raw HTML. Search snippets (QS-101) render highlighted text.
- **Likelihood / impact:** Medium / High.
- **Mitigation:** allow-list link schemes (`http`, `https`, `mailto`). Treat imported raw HTML as text. Sanitize HTML export with a strict tag and attribute allow-list. Escape `ts_headline` output before inserting markers. A CSP of `default-src 'self'` adds defence in depth (QS-132, NFR-020).
- **Trigger:** any sanitizer test failure, or a CSP violation report.
- **Owner:** Security reviewer.

### R-18: Op-log write throughput

- **Description:** each integrated batch is one `INSERT` into `document_ops`. Many active rooms could saturate the connection pool (`DB_POOL_MAX=10`).
- **Likelihood / impact:** Low / Medium.
- **Mitigation:** the per-room queue already coalesces concurrent batches. Larger batches during bursts, pool sizing guidance, and measurement in the load harness (QS-131).
- **Trigger:** pool wait time p95 above 20 ms in the metrics.
- **Owner:** Sync lead.
