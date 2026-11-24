import { compressOps, createDoc, expandRuns, localInsert, type OpRun } from '@quillsync/shared';
import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, createSyncClient, type SyncState } from '../src/collab/sync-client';
import { newClientId } from '../src/collab/useCollaborativeDoc';
import { FakeSocket } from './fake-socket';

function setup() {
  const sockets: FakeSocket[] = [];
  const timers: Array<() => void> = [];
  const states: SyncState[] = [];
  const client = createSyncClient({
    url: 'ws://test/sync',
    clientId: 'webclient1',
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onChange: (state) => states.push(state),
    random: () => 0.5,
    schedule: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    cancel: vi.fn(),
  });
  return { client, sockets, timers, states, last: () => states[states.length - 1]! };
}

const welcome = (runs: OpRun[] = [], vector: Record<string, number> = {}, canEdit = true) => ({
  type: 'welcome',
  vector,
  runs,
  peers: [],
  canEdit,
});

describe('sync client', () => {
  it('handshakes with its state vector and applies the welcome delta', () => {
    const { client, sockets, last } = setup();
    client.start();
    expect(last().status).toBe('connecting');
    sockets[0]!.open();
    expect(sockets[0]!.sentOfType('hello')).toEqual([
      { type: 'hello', clientId: 'webclient1', vector: {} },
    ]);
    const remote = compressOps(localInsert(createDoc(), 'server01', 0, 'hello').ops);
    sockets[0]!.receive(welcome(remote, { server01: 5 }));
    expect(last()).toMatchObject({ status: 'live', text: 'hello', canEdit: true });
  });

  it('sends local edits as runs and clears them on ack', () => {
    const { client, sockets, last } = setup();
    client.start();
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    client.editText('hi there');
    const ops = sockets[0]!.sentOfType('ops');
    expect(ops).toHaveLength(1);
    expect(expandRuns(ops[0]!.runs as OpRun[])).toHaveLength(8);
    expect(last().unacked).toBe(8);
    sockets[0]!.receive({ type: 'ack', vector: { webclient1: 8 } });
    expect(last().unacked).toBe(0);
    client.editText('hi there'); // no change, no ops
    expect(sockets[0]!.sentOfType('ops')).toHaveLength(1);
    client.editText('hi here');
    expect(
      expandRuns(sockets[0]!.sentOfType('ops')[1]!.runs as OpRun[]).map((op) => op.kind),
    ).toEqual(['delete']);
  });

  it('keeps offline edits and resends only what the server lacks after reconnecting', () => {
    const { client, sockets, timers, last } = setup();
    client.start();
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    client.editText('abc');
    sockets[0]!.receive({ type: 'ack', vector: { webclient1: 2 } }); // "c" not yet acked
    sockets[0]!.drop();
    expect(last().status).toBe('offline');
    client.editText('abcd'); // typed while offline
    expect(last().unacked).toBe(2);

    expect(timers).toHaveLength(1);
    timers[0]!();
    sockets[1]!.open();
    expect(sockets[1]!.sentOfType('hello')[0]!.vector).toEqual({ webclient1: 4 });
    sockets[1]!.receive(welcome([], { webclient1: 3 }));
    const resent = expandRuns(sockets[1]!.sentOfType('ops')[0]!.runs as OpRun[]);
    expect(resent.map((op) => op.id.seq)).toEqual([4]);
    expect(last().unacked).toBe(1);
  });

  it('applies remote ops, presence and departures', () => {
    const { client, sockets, last } = setup();
    client.start();
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    sockets[0]!.receive({
      type: 'ops',
      runs: compressOps(localInsert(createDoc(), 'other123', 0, 'yo').ops),
      from: 'other123',
    });
    expect(last().text).toBe('yo');
    const peer = {
      clientId: 'other123',
      userId: 'u',
      displayName: 'Grace',
      color: 'red',
      anchor: null,
      focused: true,
    };
    sockets[0]!.receive({ type: 'presence', peer });
    sockets[0]!.receive({ type: 'presence', peer: { ...peer, focused: false } });
    expect(last().peers).toEqual([{ ...peer, focused: false }]);
    sockets[0]!.receive({ type: 'peer-left', clientId: 'other123' });
    expect(last().peers).toEqual([]);
    sockets[0]!.receive({ type: 'error', code: 'INVALID_OP', message: 'bad' });
    expect(last().lastError).toBe('bad');
    sockets[0]!.receive('not json');
    expect(last().lastError).toMatch(/unreadable/);
    sockets[0]!.receive({ type: 'pong' });
  });

  it('sends presence anchors and ignores edits when read-only', () => {
    const { client, sockets, last } = setup();
    client.start();
    sockets[0]!.open();
    sockets[0]!.receive(
      welcome(
        compressOps(localInsert(createDoc(), 'server01', 0, 'abc').ops),
        { server01: 3 },
        false,
      ),
    );
    client.setPresence(2, true);
    expect(sockets[0]!.sentOfType('presence').at(-1)).toEqual({
      type: 'presence',
      anchor: { client: 'server01', seq: 2 },
      focused: true,
    });
    client.editText('abcX');
    expect(last().text).toBe('abc');
    expect(sockets[0]!.sentOfType('ops')).toHaveLength(0);
  });

  it('stops without reconnecting', () => {
    const { client, sockets, timers } = setup();
    client.start();
    client.start(); // idempotent
    sockets[0]!.open();
    client.stop();
    expect(timers).toHaveLength(0);
    expect(client.state().status).toBe('offline');
  });
});

describe('helpers', () => {
  it('backs off exponentially with jitter and a cap', () => {
    expect(backoffDelay(0, () => 1)).toBe(500);
    expect(backoffDelay(0, () => 0)).toBe(250);
    expect(backoffDelay(3, () => 1)).toBe(4000);
    expect(backoffDelay(10, () => 1)).toBe(10_000);
  });

  it('creates protocol-valid client ids', () => {
    expect(newClientId(() => 0.5)).toMatch(/^w[0-9a-z]{11}$/);
  });
});
