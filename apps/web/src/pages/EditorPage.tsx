import {
  anchorAt,
  codePointToUtf16,
  resolveAnchor,
  utf16ToCodePoint,
  type Anchor,
} from '@quillsync/shared';
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useCollaborativeDoc } from '../collab/useCollaborativeDoc';
import { PresenceList } from '../components/PresenceList';
import { RemoteCarets } from '../components/RemoteCarets';

const STATUS_LABEL = {
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  live: 'Live',
  offline: 'Offline — edits are kept and sent on reconnect',
} as const;

export function EditorPage() {
  const { id = '' } = useParams();
  return <Editor key={id} documentId={id} />;
}

function Editor({ documentId }: { documentId: string }) {
  const { clientId, client, state, lastCause } = useCollaborativeDoc(documentId);
  const [title, setTitle] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const selection = useRef<{ start: Anchor; end: Anchor } | null>(null);

  useEffect(() => {
    api
      .getDocument(documentId)
      .then((doc) => setTitle(doc.title))
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not open the document'),
      );
  }, [documentId]);

  function rememberSelection() {
    const area = textareaRef.current;
    if (!area) return;
    const doc = client.state().doc;
    const text = area.value;
    const start = utf16ToCodePoint(text, area.selectionStart);
    const end = utf16ToCodePoint(text, area.selectionEnd);
    selection.current = { start: anchorAt(doc, start), end: anchorAt(doc, end) };
    client.setPresence(end, document.activeElement === area);
  }

  // Remote ops shift text under the caret: restore it from CRDT anchors.
  useLayoutEffect(() => {
    const area = textareaRef.current;
    if (lastCause !== 'remote' || !area || !selection.current || document.activeElement !== area)
      return;
    const start = resolveAnchor(state.doc, selection.current.start);
    const end = resolveAnchor(state.doc, selection.current.end);
    if (start === null || end === null) return;
    area.setSelectionRange(codePointToUtf16(state.text, start), codePointToUtf16(state.text, end));
  }, [state, lastCause]);

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    client.editText(event.target.value);
    rememberSelection();
  }

  if (loadError) {
    return (
      <section>
        <p role="alert" className="error">
          {loadError}
        </p>
        <Link to="/app/docs">Back to documents</Link>
      </section>
    );
  }

  return (
    <section className="editor-page">
      <header className="page-header">
        <div>
          <Link to="/app/docs" className="muted">
            ← Documents
          </Link>
          <h1>{title || 'Loading…'}</h1>
        </div>
        <div className="editor-meta">
          <span className={`status status-${state.status}`} role="status">
            {STATUS_LABEL[state.status]}
            {state.unacked > 0 && state.status !== 'live' ? ` (${state.unacked} unsent)` : ''}
          </span>
          <PresenceList peers={state.peers} selfClientId={clientId} />
        </div>
      </header>
      {!state.canEdit && state.status === 'live' && (
        <p className="muted">You have read-only access.</p>
      )}
      {state.lastError && <p className="error">{state.lastError}</p>}
      <div className="editor-frame">
        <RemoteCarets
          ref={mirrorRef}
          doc={state.doc}
          text={state.text}
          peers={state.peers}
          selfClientId={clientId}
        />
        <textarea
          ref={textareaRef}
          className="editor-input"
          aria-label="Document text"
          spellCheck
          value={state.text}
          readOnly={state.status === 'live' && !state.canEdit}
          onChange={onChange}
          onSelect={rememberSelection}
          onFocus={rememberSelection}
          onBlur={() =>
            client.setPresence(
              utf16ToCodePoint(state.text, textareaRef.current?.selectionEnd ?? 0),
              false,
            )
          }
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        />
      </div>
    </section>
  );
}
