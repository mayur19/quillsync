# ADR-0016: Textarea with prefix/suffix diff before a contenteditable rich-text surface

- Status: Accepted (rich-text surface planned QS-050)
- Date: 2026-11-24
- Tickets: QS-026, QS-035, QS-050, QS-133
- Related: [system-design section 4.8](../design/system-design.md#48-prefix-suffix-text-diff)

## Context and Problem Statement

The first editor must exercise the full CRDT and sync stack end to end. A contenteditable surface needs selection mapping, IME composition handling and DOM reconciliation, which is a large project on its own (QS-050, 56 h). What surface ships first?

## Decision Drivers

- Validate CRDT, protocol, persistence and presence early.
- Correct IME and screen-reader behaviour with minimal code.
- No dependency on input event types that differ across browsers.

## Considered Options

1. Native `<textarea>`; on each `input` event compute a common-prefix/common-suffix diff between old and new value and emit one delete range plus one insert.
2. contenteditable with `beforeinput` handling from the start.
3. Adopt an editor framework (ProseMirror, Lexical) bound to the CRDT.

## Decision Outcome

Chosen option: **1**. `text/diff.ts` computes the diff in O(n); `local-ops.ts` turns it into ops whose origins are visible left neighbours. Remote changes are applied by recomputing the text, setting the textarea value, and restoring the local caret from its anchor. Remote carets are an absolutely positioned overlay.

### Consequences

- Good: IME, spell check, undo inside a composition and screen-reader support come from the platform.
- Good: the diff is independent of how the change happened (typing, paste, drag, autocorrect).
- Bad: prefix/suffix diff is ambiguous for repeated characters (typing "a" into "aa" may be attributed to either position). The text result is identical; only item identity differs, which can shift a remote caret by one position in rare cases.
- Bad: plain text only; formatting waits for QS-040/QS-050.
- Bad: browser-native textarea undo conflicts with remote edits; per-user undo is QS-044.

## Pros and Cons of the Options

- contenteditable first: the eventual target, but would delay all sync validation behind a hard UI project.
- Editor framework: fast to a rich UI; its document model and transaction mapping become a second source of truth next to the CRDT.
