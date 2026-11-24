import {
  compressOps,
  createDoc,
  localInsert,
  type OpRun,
  type ServerMessage,
} from '@quillsync/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import type { OpBatch, OpLogStore } from '../src/modules/collab/op-log.repository.js';
import { loadRoom, type Participant } from '../src/modules/collab/room.js';

function memoryStore(
  initial: OpRun[] = [],
): OpLogStore & { batches: OpBatch[]; failNext: boolean } {
  const store = {
    batches: [] as OpBatch[],
    failNext: false,
    async load() {
      return [...initial, ...store.batches.flatMap((b) => b.runs)];
    },
    async append(batch: OpBatch) {
      if (store.failNext) {
        store.failNext = false;
        throw new Error('disk full');
      }
      store.batches.push(batch);
    },
  };
  return store;
}

function participant(id: string, canEdit = true): Participant & { inbox: ServerMessage[] } {
  const inbox: ServerMessage[] = [];
  return {
    connectionId: id,
    userId: `user-${id}`,
    displayName: id,
    canEdit,
    inbox,
    send: (m) => inbox.push(m),
  };
}

const logger = pino({ level: 'silent' });
const typed = (client: string, text: string) =>
  compressOps(localInsert(createDoc(), client, 0, text).ops);

async function setup(initial: OpRun[] = []) {
  const store = memoryStore(initial);
  const room = await loadRoom({ documentId: 'd1', organizationId: 'o1', store, logger });
  return { store, room };
}

describe('room', () => {
  it('rehydrates from the op log and sends deltas on join', async () => {
    const { room } = await setup(typed('alice123', 'hello'));
    const p = participant('c1');
    await room.join(p, 'bobby123', { alice123: 2 });
    const welcome = p.inbox[0];
    expect(welcome?.type).toBe('welcome');
    if (welcome?.type === 'welcome') {
      expect(welcome.vector).toEqual({ alice123: 5 });
      expect(welcome.runs).toEqual([
        {
          k: 'i',
          client: 'alice123',
          seq: 3,
          lamport: 3,
          origin: { client: 'alice123', seq: 2 },
          text: 'llo',
        },
      ]);
    }
    expect(room.snapshot()).toEqual({ text: 'hello', vector: { alice123: 5 }, opCount: 5 });
  });

  it('persists, acks and fans out a batch exactly once', async () => {
    const { room, store } = await setup();
    const a = participant('a');
    const b = participant('b');
    await room.join(a, 'alice123', {});
    await room.join(b, 'bobby123', {});
    const runs = typed('alice123', 'hi');
    await room.submit(a, runs);
    await room.submit(a, runs); // duplicate retry
    expect(store.batches).toHaveLength(1);
    expect(store.batches[0]).toMatchObject({
      clientId: 'alice123',
      seqStart: 1,
      seqEnd: 2,
      opCount: 2,
      authorUserId: 'user-a',
    });
    expect(a.inbox.filter((m) => m.type === 'ack')).toHaveLength(2);
    expect(b.inbox.filter((m) => m.type === 'ops')).toEqual([
      { type: 'ops', runs, from: 'alice123' },
    ]);
    expect(b.inbox[0]).toMatchObject({ type: 'welcome' });
    expect(a.inbox.some((m) => m.type === 'presence')).toBe(true);
  });

  it('rejects ops for another client id, out-of-order batches, invalid ops and read-only members', async () => {
    const { room, store } = await setup();
    const a = participant('a');
    const viewer = participant('v', false);
    await room.join(a, 'alice123', {});
    await room.join(viewer, 'viewer12', {});

    await room.submit(a, typed('mallory1', 'x'));
    const gap: OpRun[] = [
      { k: 'i', client: 'alice123', seq: 5, lamport: 5, origin: null, text: 'x' },
    ];
    await room.submit(a, gap);
    const invalid: OpRun[] = [
      { k: 'i', client: 'alice123', seq: 1, lamport: 1, origin: null, text: 'x' },
      { k: 'i', client: 'alice123', seq: 2, lamport: 1, origin: null, text: 'y' },
    ];
    await room.submit(a, invalid);
    await room.submit(viewer, typed('viewer12', 'x'));

    const errors = [...a.inbox, ...viewer.inbox]
      .filter((m) => m.type === 'error')
      .map((m) => (m.type === 'error' ? m.code : ''));
    expect(errors).toEqual(['CLIENT_MISMATCH', 'CAUSALITY_VIOLATION', 'INVALID_OP', 'FORBIDDEN']);
    expect(store.batches).toHaveLength(0);
    expect(room.snapshot().text).toBe('');
  });

  it('keeps state unchanged when persistence fails', async () => {
    const { room, store } = await setup();
    const a = participant('a');
    await room.join(a, 'alice123', {});
    store.failNext = true;
    await room.submit(a, typed('alice123', 'lost'));
    expect(a.inbox.at(-1)).toMatchObject({ type: 'error', code: 'INTERNAL' });
    expect(room.snapshot().vector).toEqual({});
    await room.submit(a, typed('alice123', 'kept'));
    expect(room.snapshot().text).toBe('kept');
  });

  it('requires hello and tracks presence and departures', async () => {
    const { room } = await setup();
    const stranger = participant('s');
    await room.submit(stranger, typed('stranger', 'x'));
    expect(stranger.inbox[0]).toMatchObject({ type: 'error', code: 'NOT_READY' });
    room.updatePresence(stranger, null, true); // ignored
    room.leave(stranger); // ignored

    const a = participant('a');
    const b = participant('b');
    await room.join(a, 'alice123', {});
    await room.join(b, 'bobby123', {});
    room.updatePresence(a, { client: 'alice123', seq: 1 }, true);
    expect(b.inbox.at(-1)).toMatchObject({
      type: 'presence',
      peer: { clientId: 'alice123', focused: true },
    });
    expect(room.peers()).toHaveLength(2);
    room.leave(a);
    expect(b.inbox.at(-1)).toEqual({ type: 'peer-left', clientId: 'alice123' });
    expect(room.size).toBe(1);
  });
});
