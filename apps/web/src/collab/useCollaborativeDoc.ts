import { useEffect, useMemo, useRef, useState } from 'react';
import { syncUrl } from '../api/client';
import { createSyncClient, type SyncClient, type SyncState } from './sync-client';

export function newClientId(random: () => number = Math.random): string {
  let id = 'w';
  for (let i = 0; i < 11; i += 1) id += Math.floor(random() * 36).toString(36);
  return id;
}

export interface CollaborativeDoc {
  readonly clientId: string;
  readonly state: SyncState;
  readonly lastCause: 'local' | 'remote' | 'status';
  readonly client: SyncClient;
}

/** Owns one sync client per mounted editor; a fresh client id per tab/mount. */
export function useCollaborativeDoc(documentId: string): CollaborativeDoc {
  const clientId = useMemo(() => newClientId(), []);
  const [snapshot, setSnapshot] = useState<{
    state: SyncState;
    cause: 'local' | 'remote' | 'status';
  } | null>(null);
  const clientRef = useRef<SyncClient | null>(null);

  if (clientRef.current === null) {
    clientRef.current = createSyncClient({
      url: syncUrl(documentId),
      clientId,
      onChange: (state, cause) => setSnapshot({ state, cause }),
    });
  }
  const client = clientRef.current;

  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  return {
    clientId,
    client,
    state: snapshot?.state ?? client.state(),
    lastCause: snapshot?.cause ?? 'status',
  };
}
