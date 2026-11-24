import {
  anchorAt,
  applyOps,
  compressOps,
  createDoc,
  diffText,
  expandRuns,
  localDelete,
  localInsert,
  opsMissingFrom,
  serverMessageSchema,
  toText,
  vectorCovers,
  visibleLength,
  type Anchor,
  type DocState,
  type Op,
  type Peer,
  type ServerMessage,
  type StateVector,
} from '@quillsync/shared';

/** The subset of the browser WebSocket API the client needs (fakeable in tests). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

export type ConnectionStatus = 'connecting' | 'syncing' | 'live' | 'offline';

export interface SyncState {
  readonly doc: DocState;
  readonly text: string;
  readonly status: ConnectionStatus;
  readonly peers: readonly Peer[];
  readonly canEdit: boolean;
  /** Local ops not yet acknowledged by the server. */
  readonly unacked: number;
  readonly lastError: string | null;
}

export interface SyncClientOptions {
  readonly url: string;
  readonly clientId: string;
  readonly createSocket?: (url: string) => SocketLike;
  readonly onChange: (state: SyncState, cause: 'local' | 'remote' | 'status') => void;
  readonly random?: () => number;
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

export interface SyncClient {
  start(): void;
  stop(): void;
  /** Applies a full-text change from the editor as CRDT ops. */
  editText(nextText: string): void;
  setPresence(visibleIndex: number, focused: boolean): void;
  state(): SyncState;
}

const OPEN = 1;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;

/** Exponential backoff with full jitter: random in [0.5, 1] x min(cap, base x 2^attempt). */
export function backoffDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random() / 2));
}

/**
 * Client half of the sync protocol. Local edits are applied immediately and
 * queued in an outbox until the server acknowledges them; on every (re)connect
 * the hello carries the local state vector, the server replies with what we
 * miss, and we resend whatever the server's vector does not cover. Edits made
 * while offline therefore merge on reconnect.
 */
export function createSyncClient(options: SyncClientOptions): SyncClient {
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel =
    options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let doc: DocState = createDoc();
  let outbox: Op[] = [];
  let status: ConnectionStatus = 'offline';
  let peers: Peer[] = [];
  let canEdit = false;
  let lastError: string | null = null;
  let socket: SocketLike | null = null;
  let attempt = 0;
  let timer: unknown = null;
  let stopped = true;
  let presence: { anchor: Anchor; focused: boolean } = { anchor: null, focused: false };

  const snapshot = (): SyncState => ({
    doc,
    text: toText(doc),
    status,
    peers,
    canEdit,
    unacked: outbox.length,
    lastError,
  });
  const emit = (cause: 'local' | 'remote' | 'status') => options.onChange(snapshot(), cause);

  function send(message: unknown): void {
    if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(message));
  }

  function flush(serverVector: StateVector | null): void {
    const pending = serverVector ? opsMissingFrom(outbox, serverVector) : outbox;
    if (pending.length > 0 && status === 'live') send({ type: 'ops', runs: compressOps(pending) });
  }

  function handle(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        doc = applyOps(doc, expandRuns(message.runs));
        peers = [...message.peers];
        canEdit = message.canEdit;
        status = 'live';
        attempt = 0;
        outbox = outbox.filter((op) => !vectorCovers(message.vector, op.id));
        flush(message.vector);
        send({ type: 'presence', ...presence });
        return emit('remote');
      case 'ops':
        doc = applyOps(doc, expandRuns(message.runs));
        return emit('remote');
      case 'ack':
        outbox = outbox.filter((op) => !vectorCovers(message.vector, op.id));
        return emit('status');
      case 'presence':
        peers = [...peers.filter((p) => p.clientId !== message.peer.clientId), message.peer];
        return emit('status');
      case 'peer-left':
        peers = peers.filter((p) => p.clientId !== message.clientId);
        return emit('status');
      case 'error':
        lastError = message.message;
        return emit('status');
      case 'pong':
        return;
    }
  }

  function connect(): void {
    status = 'connecting';
    emit('status');
    const next = createSocket(options.url);
    socket = next;
    next.onopen = () => {
      status = 'syncing';
      send({ type: 'hello', clientId: options.clientId, vector: doc.vector });
      emit('status');
    };
    next.onmessage = (event) => {
      try {
        const parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
        if (parsed.success) handle(parsed.data);
      } catch {
        lastError = 'Received an unreadable message';
        emit('status');
      }
    };
    next.onclose = () => {
      if (socket !== next) return;
      socket = null;
      status = 'offline';
      peers = [];
      emit('status');
      if (!stopped) {
        timer = schedule(connect, backoffDelay(attempt, random));
        attempt += 1;
      }
    };
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (timer !== null) cancel(timer);
      const current = socket;
      socket = null;
      current?.close();
      status = 'offline';
    },
    editText(nextText) {
      if (!canEdit && status === 'live') return;
      const edit = diffText(toText(doc), nextText);
      if (!edit) return;
      const ops: Op[] = [];
      if (edit.deleteCount > 0) {
        const change = localDelete(doc, options.clientId, edit.index, edit.deleteCount);
        doc = change.doc;
        ops.push(...change.ops);
      }
      if (edit.insert.length > 0) {
        const change = localInsert(doc, options.clientId, edit.index, edit.insert);
        doc = change.doc;
        ops.push(...change.ops);
      }
      outbox = [...outbox, ...ops];
      if (status === 'live') send({ type: 'ops', runs: compressOps(ops) });
      emit('local');
    },
    setPresence(visibleIndex, focused) {
      presence = {
        anchor: anchorAt(doc, Math.max(0, Math.min(visibleIndex, visibleLength(doc)))),
        focused,
      };
      if (status === 'live') send({ type: 'presence', ...presence });
    },
    state: snapshot,
  };
}
