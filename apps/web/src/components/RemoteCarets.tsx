import { resolveAnchor, type DocState, type Peer } from '@quillsync/shared';
import { forwardRef, type ReactNode } from 'react';

interface Props {
  readonly doc: DocState;
  readonly text: string;
  readonly peers: readonly Peer[];
  readonly selfClientId: string;
}

/**
 * Mirror layer laid over the textarea with identical typography. The text is
 * transparent; only caret markers for remote peers are visible. Caret positions
 * come from CRDT anchors, so they stay attached to the right character while
 * other people type.
 */
export const RemoteCarets = forwardRef<HTMLDivElement, Props>(function RemoteCarets(
  { doc, text, peers, selfClientId },
  ref,
) {
  const chars = Array.from(text);
  const carets = peers
    .filter((peer) => peer.clientId !== selfClientId && peer.focused)
    .map((peer) => ({ peer, offset: resolveAnchor(doc, peer.anchor) }))
    .filter((c): c is { peer: Peer; offset: number } => c.offset !== null)
    .sort((a, b) => a.offset - b.offset);

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { peer, offset } of carets) {
    parts.push(chars.slice(cursor, offset).join(''));
    parts.push(
      <span
        key={peer.clientId}
        className="remote-caret"
        style={{ borderColor: peer.color }}
        data-testid="remote-caret"
      >
        <span className="remote-caret-label" style={{ background: peer.color }}>
          {peer.displayName}
        </span>
      </span>,
    );
    cursor = offset;
  }
  parts.push(chars.slice(cursor).join(''));
  return (
    <div ref={ref} className="editor-mirror" aria-hidden="true">
      {parts}
      {'​'}
    </div>
  );
});
