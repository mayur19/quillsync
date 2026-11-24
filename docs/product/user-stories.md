# User stories

Stories are grouped by epic (E1 to E11; E0 Foundation is internal tooling and its operator stories sit under E11). Personas come from [PRD.md §3](PRD.md#3-personas): **Ada** (owner), **Grace** (editor), **Linus** (reviewer, viewer or commenter), **Sam** (operator).

A story is marked **implemented** only when every ticket it lists is `done` in [../planning/backlog.md](../planning/backlog.md). Otherwise it is **pending**.

| Epic                                  | Stories | Implemented | Pending |
| ------------------------------------- | ------: | ----------: | ------: |
| E1 Identity & access                  |       9 |           4 |       5 |
| E2 CRDT core                          |       7 |           3 |       4 |
| E3 Real-time sync                     |       9 |           5 |       4 |
| E4 Persistence & compaction           |       4 |           0 |       4 |
| E5 Version history                    |       4 |           0 |       4 |
| E6 Comments, mentions & notifications |       5 |           0 |       5 |
| E7 Workspace, folders & sharing       |       5 |           0 |       5 |
| E8 Search                             |       3 |           0 |       3 |
| E9 Import & export                    |       3 |           0 |       3 |
| E10 Offline                           |       3 |           0 |       3 |
| E11 Operations & hardening            |       6 |           1 |       5 |
| **Total**                             |  **58** |      **13** |  **45** |

---

## E1: Identity and access

### US-01: Register a workspace (implemented)

As **Ada**, I want to register my organization so that my team has a private workspace.
Tickets: QS-008 · FRs: FR-007

- **Given** no account exists for `ada@northwind.test`, **when** Ada submits name, email, password and organization "Northwind Editorial", **then** the organization and her owner membership are created and, after the client signs her in with the same credentials, she lands on the document list.
- **Given** that email is already registered, **when** anyone registers with it again (in any letter case), **then** the response is the same 202 as for a new account (no enumeration), nothing is created and the attempt is audited.

### US-02: Sign in and out (implemented)

As **Grace**, I want to sign in and out securely so that only I can use my account.
Tickets: QS-009 · FRs: FR-008

- **Given** valid credentials, **when** Grace signs in, **then** an HttpOnly `qs_session` cookie is set and `GET /api/v1/auth/me` returns her role `editor` and its permissions.
- **Given** Grace is signed in, **when** she signs out, **then** her session row is deleted and later requests return 401.

### US-03: Protection against forged requests and password guessing (implemented)

As **Ada**, I want the app to block cross-site forged requests and password guessing so that accounts cannot be hijacked.
Tickets: QS-010 · FRs: FR-009, FR-010

- **Given** an authenticated session, **when** a POST arrives without a matching `x-csrf-token`, **then** it is rejected with 403 `CSRF_INVALID`.
- **Given** 5 failed sign-ins for one email (from any mix of IPs), **when** a 6th attempt fails, **then** that email is locked for 30 s, doubling on each further failure up to 15 minutes, and locked attempts return 429 `RATE_LIMITED` with `Retry-After`.
- **Given** one client IP (or one IPv6 /64) has tried 20 different emails in 15 minutes, **when** it tries a 21st, **then** it gets 429 without the password being checked.
- **Given** an attacker fires many bad sign-ins in parallel, **when** they arrive at once, **then** no more than the free attempts plus one get past the throttle.

### US-04: Roles limit what people can do (implemented)

As **Ada**, I want roles to control capabilities so that reviewers cannot change text.
Tickets: QS-011, QS-012 · FRs: FR-011, FR-012

- **Given** Linus has the viewer role, **when** he calls `POST /api/v1/documents`, **then** he receives 403 `FORBIDDEN`.
- **Given** Grace creates a document, **when** the request completes, **then** an `audit_log` row records actor, action, target and request ID.

### US-05: Invite a colleague (pending)

As **Ada**, I want to invite colleagues by email with a role so that they can join the workspace.
Tickets: QS-014 · FRs: FR-013

- **Given** Ada has `member:manage`, **when** she invites `linus@northwind.test` as commenter, **then** an `outbox_messages` row containing a single-use accept link is written.
- **Given** the invitation is older than 7 days, **when** Linus opens the link, **then** he sees "invitation expired" and no membership is created.

### US-06: Reset a forgotten password (pending)

As **Grace**, I want to reset my password so that I can regain access.
Tickets: QS-015 · FRs: FR-014

- **Given** any email address, **when** a reset is requested, **then** the response is 202 whether or not the account exists.
- **Given** a valid reset token, **when** Grace sets a new password, **then** all her existing sessions are revoked and the token cannot be reused.

### US-07: Manage my sessions (pending)

As **Grace**, I want to see and revoke my signed-in devices so that I can sign out a lost laptop.
Tickets: QS-016 · FRs: FR-015

- **Given** Grace is signed in on two browsers, **when** she revokes the other session, **then** that browser's next request returns 401 and its open sockets close.

### US-08: Manage members (pending)

As **Ada**, I want to change roles and remove members so that access matches responsibilities.
Tickets: QS-017, QS-018 · FRs: FR-016, FR-017

- **Given** Ada is the only owner, **when** she tries to demote herself, **then** she gets 409 and her role is unchanged.
- **Given** Grace is removed, **when** the change commits, **then** her sessions for Northwind are deleted.

### US-09: Review the audit log (pending)

As **Ada**, I want to search the audit log so that I can answer "who did this?".
Tickets: QS-019 · FRs: FR-018

- **Given** Ada has `audit:read`, **when** she filters by actor Grace and the last 7 days, **then** she sees matching events newest first, paginated 100 at a time.

### US-59: Verify my email before my workspace activates (pending)

As **Ada**, I want new accounts to be activated through a link sent to the address so that nobody can sign up with someone else's email, and so that the signup form never reveals who already has an account.
Tickets: QS-140 · FRs: FR-095

- **Given** a new email, **when** Ada registers, **then** the response is 202 and an activation message is written to `outbox_messages`; signing in before activation is refused.
- **Given** an email that already has an account, **when** anyone registers with it, **then** the response is the same 202 and the outbox gets a "you already have an account" message instead.

---

## E2: CRDT core

### US-10: Concurrent edits never fork the document (implemented)

As **Grace**, I want my edits and my co-author's edits to merge into the same text on both screens so that we never have conflicting copies.
Tickets: QS-020, QS-021, QS-022, QS-023, QS-027 · FRs: FR-019, FR-020, FR-021 · NFRs: NFR-001, NFR-003

- **Given** two replicas at the same state, **when** each inserts and deletes concurrently and the ops arrive in different orders (including duplicates), **then** both materialize identical text.
- **Given** an op arrives before the op it depends on, **when** it is received, **then** it waits in the pending buffer and is integrated as soon as the dependency arrives.

### US-11: Words typed at the same place stay intact (implemented)

As **Grace**, I want text I type to stay contiguous even when a colleague types at the same spot so that sentences are not scrambled.
Tickets: QS-021, QS-027 · FRs: FR-019 · NFRs: NFR-002

- **Given** Grace types "hello" and Ada concurrently types "world" after the same character, **when** the ops merge, **then** the result contains "hello" and "world" each as an unbroken run, in an order determined by (lamport, client).

### US-12: Compact sync payloads and safe cursors (implemented)

As **Sam**, I want ops to be compact on the wire and in storage, and cursors to survive edits, so that bandwidth and database growth stay low and presence stays accurate.
Tickets: QS-024, QS-025, QS-026 · FRs: FR-022, FR-023, FR-024 · NFRs: NFR-005

- **Given** a run of 200 characters typed by one client, **when** it is encoded, **then** it is stored as a single run.
- **Given** malformed bytes, **when** the codec decodes them, **then** it throws `CodecError` and the process stays healthy.
- **Given** a caret anchored after a character that is then deleted, **when** the anchor resolves, **then** it points at the same logical position.

### US-13: Format text (pending)

As **Grace**, I want bold, italic, inline code and links so that documents read well.
Tickets: QS-040 · FRs: FR-025

- **Given** Grace bolds a word while Ada italicizes an overlapping range, **when** the ops merge, **then** both replicas show identical formatting.

### US-14: Structure documents in blocks (pending)

As **Grace**, I want headings, lists, quotes, code blocks, tables and images so that I can structure long documents.
Tickets: QS-041, QS-042, QS-046, QS-047 · FRs: FR-026, FR-027, FR-031, FR-032

- **Given** a paragraph, **when** Grace presses Enter in the middle, **then** it splits into two blocks on every replica.
- **Given** Grace and Ada move the same block concurrently, **when** the moves merge, **then** the block appears exactly once.

### US-15: Undo only my own changes (pending)

As **Grace**, I want undo to revert only what I did so that I never erase a co-author's work.
Tickets: QS-044 · FRs: FR-029

- **Given** Grace typed a sentence and Ada then typed inside it, **when** Grace presses Ctrl/Cmd+Z, **then** Grace's characters are removed and Ada's remain.

### US-16: Large documents stay fast (pending)

As **Grace**, I want 100-page documents to stay responsive so that long reports are practical.
Tickets: QS-043, QS-045 · FRs: FR-028, FR-030 · NFRs: NFR-007, NFR-008

- **Given** a document of 1,000,000 items, **when** a remote op is integrated, **then** p95 integration time is under 1 ms.

---

## E3: Real-time sync

### US-17: See changes live (implemented)

As **Grace**, I want to see co-authors' typing as it happens so that we can write together.
Tickets: QS-030, QS-035 · FRs: FR-033, FR-034, FR-040

- **Given** Grace and Ada have the same document open, **when** Ada types, **then** Grace's editor shows the change without a reload, and Ada receives an `ack`.
- **Given** Grace joins late, **when** her client sends `hello` with an empty vector, **then** `welcome` contains every op and her text matches Ada's.

### US-18: Reviewers cannot edit (implemented)

As **Linus**, I want to read live drafts without any risk of changing them.
Tickets: QS-030, QS-011 · FRs: FR-035

- **Given** Linus is a viewer, **when** his client sends an `ops` frame, **then** the server replies `error {code: FORBIDDEN}` and no op is integrated.
- **Given** a page on another origin, **when** it opens the sync socket using Linus's cookie, **then** the upgrade is rejected.

### US-19: Edits survive a server restart (implemented)

As **Grace**, I want acknowledged edits to be safe even if the server restarts.
Tickets: QS-031 · FRs: FR-036 · NFRs: NFR-011

- **Given** Grace's ops were acknowledged, **when** the API restarts and she rejoins, **then** the document text and vector are unchanged.

### US-20: Know who is here (implemented)

As **Grace**, I want to see collaborators' names and carets so that we don't type over each other.
Tickets: QS-032, QS-035 · FRs: FR-037

- **Given** Ada moves her caret, **when** the presence update arrives, **then** Grace sees Ada's coloured caret at the anchored character with her name.
- **Given** Ada closes her tab, **when** the socket closes, **then** her caret disappears for everyone.

### US-21: Keep working through a network blip (implemented)

As **Grace**, I want edits made during a brief disconnect to sync automatically.
Tickets: QS-036, QS-033, QS-034 · FRs: FR-041, FR-038, FR-039

- **Given** Grace's connection drops for 20 s while she types, **when** it returns, **then** the client reconnects with backoff, resends unacknowledged ops, and both sides converge.
- **Given** the tab stays open, **when** reconnection succeeds, **then** no keystroke is lost. (A reload while offline is covered by US-50.)

### US-22: Rich editing with IME (pending)

As **Grace**, I want a rich-text editor that handles Japanese IME input and selections correctly.
Tickets: QS-050 · FRs: FR-042 · NFRs: NFR-007

- **Given** Grace is composing with an IME, **when** a remote op arrives, **then** the composition is not interrupted and is committed as one insert run.

### US-23: Richer awareness (pending)

As **Grace**, I want to see collaborators' selections and follow a presenter.
Tickets: QS-051, QS-057 · FRs: FR-043, FR-049

- **Given** Ada selects a paragraph, **when** Grace looks at the document, **then** the range is highlighted in Ada's colour.

### US-24: Lose access immediately (pending)

As **Ada**, I want removing someone's access to cut off their open sessions at once.
Tickets: QS-056 · FRs: FR-048 · NFRs: NFR-036

- **Given** Grace has the document open, **when** Ada downgrades her to viewer, **then** within 5 s her `ops` frames are rejected.

### US-25: Scale beyond one server (pending)

As **Sam**, I want several API nodes to serve one document so that I can scale and survive node failure.
Tickets: QS-052, QS-053, QS-054, QS-055 · FRs: FR-044, FR-045, FR-046, FR-047 · NFRs: NFR-033, NFR-035

- **Given** Grace is on node A and Ada on node B, **when** Ada types, **then** Grace receives the ops within NFR-009 bounds.
- **Given** the room-owning node dies, **when** 10 s pass, **then** another node owns the room and accepts ops.

---

## E4: Persistence and compaction

### US-26: Fast document open (pending)

As **Grace**, I want old, heavily edited documents to open quickly.
Tickets: QS-060, QS-061 · FRs: FR-050, FR-051 · NFRs: NFR-014

- **Given** a document with 100,000 historical ops, **when** the first user joins, **then** the room loads from snapshot plus tail in under 500 ms (p95).

### US-27: Storage doesn't grow forever (pending)

As **Sam**, I want deleted text eventually reclaimed so that storage and memory stay bounded.
Tickets: QS-062, QS-063 · FRs: FR-052, FR-053 · NFRs: NFR-013

- **Given** every active replica has acknowledged a delete, **when** the next snapshot cycle runs, **then** childless stable tombstones are collected and the visible text is unchanged.
- **Given** a replica has been silent past the eviction window, **when** it reconnects, **then** it is told to resync, and its unsent local edits are re-applied as new inserts.

### US-28: Trustworthy backups (pending)

As **Sam**, I want to prove that backups restore correctly.
Tickets: QS-064 · FRs: FR-054 · NFRs: NFR-029

- **Given** a production database, **when** the backup verification runs, **then** it restores to a scratch database and reports zero mismatches in document text or vector.

### US-29: Force a snapshot before maintenance (pending)

As **Sam**, I want to force a snapshot so that I can compact before an upgrade.
Tickets: QS-060 · FRs: FR-050

- **Given** owner credentials, **when** Sam calls `POST /api/v1/documents/:id/snapshots`, **then** a snapshot row is written and its high-water op ID is returned.

---

## E5: Version history

### US-30: Name a version (pending)

As **Grace**, I want to name the current state "Sent to legal" so that I can return to it.
Tickets: QS-070, QS-071 · FRs: FR-055, FR-056

- **Given** Grace has edit rights, **when** she saves a version named "Sent to legal", **then** it appears at the top of the history list with her name and time.

### US-31: Compare versions (pending)

As **Linus**, I want to see what changed since "Sent to legal".
Tickets: QS-072, QS-074 · FRs: FR-057, FR-059

- **Given** two versions, **when** Linus opens the diff, **then** insertions and deletions are highlighted and attributed by item IDs.

### US-32: Restore without disrupting collaborators (pending)

As **Grace**, I want to restore an earlier version while others are connected, without breaking their sessions.
Tickets: QS-073 · FRs: FR-058

- **Given** Ada is typing, **when** Grace restores "Sent to legal", **then** Ada receives the restore as ordinary ops and her concurrent keystrokes are kept.

### US-33: Retention of automatic versions (pending)

As **Ada**, I want old automatic checkpoints pruned while named versions are kept.
Tickets: QS-075 · FRs: FR-060

- **Given** a 90-day retention, **when** pruning runs, **then** automatic checkpoints older than 90 days are removed and named versions remain.

---

## E6: Comments, mentions and notifications

### US-34: Comment on a sentence (pending)

As **Linus** (commenter), I want to attach a comment to a specific sentence.
Tickets: QS-080 · FRs: FR-061

- **Given** Linus selects a sentence, **when** he posts a comment, **then** the thread is anchored to that range and the highlight moves as others edit around it.

### US-35: Comments survive heavy editing (pending)

As **Linus**, I want my comments to stay attached through rewrites, GC and restores.
Tickets: QS-081 · FRs: FR-062

- **Given** the commented text is entirely deleted, **when** Linus opens the sidebar, **then** the thread shows as detached with the original quote.

### US-36: Resolve discussions (pending)

As **Grace**, I want to resolve threads I've addressed.
Tickets: QS-082, QS-086 · FRs: FR-063, FR-067

- **Given** an open thread, **when** Grace resolves it, **then** it is hidden from the default sidebar view and can be reopened.

### US-37: Mention a colleague (pending)

As **Linus**, I want to @mention Grace so that she sees my question.
Tickets: QS-083 · FRs: FR-064

- **Given** Grace can read the document, **when** Linus writes "@Grace please confirm", **then** Grace gets an in-app notification linking to the thread.
- **Given** the mentioned user cannot read the document, **when** the comment is posted, **then** no notification is created.

### US-38: Notification center (pending)

As **Grace**, I want a list of my notifications with unread counts and an optional daily digest.
Tickets: QS-084, QS-085 · FRs: FR-065, FR-066

- **Given** 3 unread notifications, **when** Grace opens the center and clicks one, **then** the unread count drops to 2.

---

## E7: Workspace, folders and sharing

### US-39: Organize in folders (pending)

As **Grace**, I want to put documents into nested folders.
Tickets: QS-090 · FRs: FR-068

- **Given** folder "Launch", **when** Grace moves it inside its own subfolder, **then** the move is rejected with 409.

### US-40: Rename, archive and delete documents (pending)

As **Grace**, I want to rename, archive or trash documents.
Tickets: QS-091 · FRs: FR-069

- **Given** a trashed document, **when** 30 days pass, **then** it and all its ops, snapshots, versions and comments are permanently deleted.

### US-41: Per-document permissions (pending)

As **Ada**, I want to grant an outside reviewer access to a single folder.
Tickets: QS-092 · FRs: FR-070

- **Given** Linus is a viewer at organization level with commenter on folder "Legal", **when** he opens a document in "Legal", **then** he can comment.

### US-42: Share by link (pending)

As **Grace**, I want a sharing link that expires.
Tickets: QS-093 · FRs: FR-071

- **Given** a commenter link that expires in 3 days, **when** a signed-in member opens it on day 4, **then** access is denied.

### US-43: Templates, activity and multiple workspaces (pending)

As **Grace**, I want templates, an activity feed and a workspace switcher.
Tickets: QS-094, QS-095, QS-096 · FRs: FR-072, FR-073, FR-074

- **Given** a "Meeting notes" template, **when** Grace creates from it, **then** a new document with the template's blocks opens, editable by her.

---

## E8: Search

### US-44: Find documents by content (pending)

As **Grace**, I want to search across the workspace with highlighted snippets.
Tickets: QS-100, QS-101, QS-103 · FRs: FR-075, FR-076, FR-078 · NFRs: NFR-031

- **Given** "launch budget" appears in "Q3 launch plan", **when** Grace searches `launch budget`, **then** that document is ranked first and its snippet highlights both words.

### US-45: Search respects permissions (pending)

As **Ada**, I want search never to reveal documents a user cannot open.
Tickets: QS-102 · FRs: FR-077

- **Given** Linus has no access to "Interview notes", **when** he searches a phrase from it, **then** zero results are returned and the total count excludes it.

### US-46: Search comments (pending)

As **Linus**, I want to find a discussion by a word in a comment.
Tickets: QS-104 · FRs: FR-079

- **Given** a comment mentions "embargo", **when** Linus searches "embargo", **then** the result opens the thread.

---

## E9: Import and export

### US-47: Export to Markdown or HTML (pending)

As **Grace**, I want to export a document to Markdown or HTML to publish it elsewhere.
Tickets: QS-110, QS-111 · FRs: FR-080, FR-081

- **Given** a document with headings, lists and links, **when** Grace exports Markdown, **then** the file renders the same structure in a CommonMark viewer.
- **Given** a link with a `javascript:` href was imported, **when** exported to HTML, **then** the href is removed.

### US-48: Import Markdown (pending)

As **Grace**, I want to import existing Markdown notes.
Tickets: QS-112 · FRs: FR-082 · NFRs: NFR-032

- **Given** a 200 KB Markdown file, **when** Grace imports it, **then** a new document opens with matching blocks and marks, and collaborators can edit it immediately.

### US-49: Bulk export (pending)

As **Ada**, I want to export the entire workspace.
Tickets: QS-113, QS-114 · FRs: FR-083, FR-084

- **Given** 500 documents, **when** Ada requests a workspace export, **then** a background job completes and offers a download link valid for 24 h.

---

## E10: Offline

### US-50: Edits survive a reload while offline (pending)

As **Grace**, on a train, I want my offline edits to survive closing the laptop.
Tickets: QS-120 · FRs: FR-085 · NFRs: NFR-027

- **Given** Grace is offline and types three paragraphs, **when** she reloads the tab, **then** the paragraphs are still there.
- **Given** she later reconnects while Ada has edited the same document, **when** sync completes, **then** both edits are present on both screens.

### US-51: Know when I'm offline (pending)

As **Grace**, I want clear offline and sync indicators.
Tickets: QS-121 · FRs: FR-086

- **Given** the socket closes, **when** 2 s pass, **then** an offline banner shows the number of unsynced changes.

### US-52: Open the app without a network (pending)

As **Grace**, I want the app to load without a connection.
Tickets: QS-122 · FRs: FR-087

- **Given** Grace opened "Style guide" yesterday, **when** she starts the browser offline, **then** the shell and that document load.

---

## E11: Operations and hardening

### US-53: One-command install (implemented)

As **Sam**, I want one script to set up and run quillsync on a plain Linux host with PostgreSQL.
Tickets: QS-001 to QS-007, QS-013 · FRs: FR-001 to FR-006 · NFRs: NFR-022, NFR-023, NFR-025

- **Given** Node.js 22 and PostgreSQL 15 are installed, **when** Sam runs `./run.sh`, **then** `.env` is created, migrations are applied, demo data is seeded, and the editor is available at `http://localhost:5104`.
- **Given** a mistyped `DATABASE_URL`, **when** the API starts, **then** it exits with a message naming the invalid field.

### US-54: Monitor the server (pending)

As **Sam**, I want Prometheus metrics for rooms, sockets and latency.
Tickets: QS-130 · FRs: FR-088 · NFRs: NFR-024

- **Given** a scrape from an allowed address, **when** `GET /api/metrics` is requested, **then** it returns the `quillsync_*` series in text format.

### US-55: Prove capacity before launch (pending)

As **Sam**, I want to load-test the sync server so that I know how many editors one host supports.
Tickets: QS-131 · FRs: FR-089 · NFRs: NFR-009

- **Given** 20 simulated editors at 5 ops/s, **when** the harness runs for 10 minutes, **then** it reports p95 fan-out latency and confirms every client converged.

### US-56: Collaboration verified in real browsers (pending)

As **Ada**, I want automated multi-browser tests so that releases don't break co-editing.
Tickets: QS-134 · FRs: FR-090 · NFRs: NFR-028

- **Given** Chromium and Firefox contexts on the same document, **when** both type concurrently, **then** the final texts are identical.

### US-57: Accessible and secure by default (pending)

As **Linus**, who uses a screen reader, I want the editor and comments to be fully operable by keyboard and announced correctly.
Tickets: QS-132, QS-133, QS-137 · NFRs: NFR-020, NFR-021, NFR-034

- **Given** VoiceOver is on, **when** a collaborator joins, **then** a live region announces their name.
- **Given** a production deployment, **when** scanned, **then** only TLS 1.2+ is offered and CSP headers are present.

### US-58: Administer data lifecycle (pending)

As **Ada**, I want to see storage use, delete the organization, and use the app on a phone in my language.
Tickets: QS-135, QS-136, QS-138, QS-139 · FRs: FR-091, FR-092, FR-093, FR-094

- **Given** Ada confirms organization deletion, **when** 7 days pass, **then** all organization data and uploads are removed and the action is audited.
