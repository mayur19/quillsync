import type { Peer } from '@quillsync/shared';

export function PresenceList({
  peers,
  selfClientId,
}: {
  peers: readonly Peer[];
  selfClientId: string;
}) {
  const others = peers.filter((peer) => peer.clientId !== selfClientId);
  if (others.length === 0) return <p className="muted presence-empty">Only you are here.</p>;
  return (
    <ul className="presence" aria-label="People editing this document">
      {others.map((peer) => (
        <li
          key={peer.clientId}
          className="presence-item"
          title={peer.focused ? 'Editing' : 'Viewing'}
        >
          <span className="avatar" style={{ background: peer.color }} aria-hidden="true">
            {peer.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span>{peer.displayName}</span>
          {peer.focused && <span className="sr-only"> (editing)</span>}
        </li>
      ))}
    </ul>
  );
}
