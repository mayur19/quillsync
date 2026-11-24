import {
  applyOps,
  compressOps,
  createDoc,
  expandRuns,
  localDelete,
  localInsert,
  serverMessageSchema,
  toText,
  type DocState,
  type ServerMessage,
} from '@quillsync/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  addMember,
  APP_ORIGIN,
  authed,
  createTestContext,
  registerOwner,
  truncateAll,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let baseUrl: string;

beforeAll(async () => {
  ctx = await createTestContext();
  const address = await ctx.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = address.replace('http', 'ws');
});
afterAll(async () => ctx.close());
beforeEach(async () => truncateAll(ctx.db));

interface Client {
  socket: WebSocket;
  inbox: ServerMessage[];
  next(type: ServerMessage['type']): Promise<ServerMessage>;
  send(message: unknown): void;
  close(): Promise<void>;
}

function connect(session: Session, documentId: string, origin = APP_ORIGIN): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}/api/v1/documents/${documentId}/sync`, {
      headers: { cookie: session.cookie, origin },
    });
    const inbox: ServerMessage[] = [];
    const waiters: Array<{ type: string; resolve: (m: ServerMessage) => void }> = [];
    socket.on('message', (raw) => {
      const message = serverMessageSchema.parse(JSON.parse(raw.toString()));
      const index = waiters.findIndex((w) => w.type === message.type);
      if (index >= 0) waiters.splice(index, 1)[0]!.resolve(message);
      else inbox.push(message);
    });
    socket.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    socket.on('error', reject);
    socket.on('open', () =>
      resolve({
        socket,
        inbox,
        next(type) {
          const index = inbox.findIndex((m) => m.type === type);
          if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]!);
          return new Promise((res) => waiters.push({ type, resolve: res }));
        },
        send: (message) =>
          socket.send(typeof message === 'string' ? message : JSON.stringify(message)),
        close: () =>
          new Promise((res) => {
            socket.once('close', () => res());
            socket.close();
          }),
      }),
    );
  });
}

async function createDocument(owner: Session): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: authed(owner, true),
    payload: { title: 'Doc' },
  });
  return response.json().data.id;
}

async function waitForRoomsUnloaded(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const health = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    if (health.json().data.rooms === 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('room did not unload');
}

describe('WebSocket sync', () => {
  it('converges two editors through the server and persists the op log', async () => {
    const owner = await registerOwner(ctx.app);
    const editor = await addMember(ctx, owner.organizationId, 'editor');
    const docId = await createDocument(owner);
    const a = await connect(owner, docId);
    const b = await connect(editor, docId);
    a.send({ type: 'hello', clientId: 'alice123', vector: {} });
    expect(await a.next('welcome')).toMatchObject({ type: 'welcome', canEdit: true, peers: [] });
    b.send({ type: 'hello', clientId: 'bobby123', vector: {} });
    const welcomeB = await b.next('welcome');
    expect(welcomeB).toMatchObject({ peers: [{ clientId: 'alice123' }] });
    expect(await a.next('presence')).toMatchObject({ peer: { clientId: 'bobby123' } });

    // Concurrent edits from both replicas starting from the same (empty) state.
    let docA: DocState = createDoc();
    let docB: DocState = createDoc();
    const editA = localInsert(docA, 'alice123', 0, 'Hello');
    const editB = localInsert(docB, 'bobby123', 0, 'World');
    docA = editA.doc;
    docB = editB.doc;
    a.send({ type: 'ops', runs: compressOps(editA.ops) });
    b.send({ type: 'ops', runs: compressOps(editB.ops) });

    const fromB = await a.next('ops');
    const fromA = await b.next('ops');
    if (fromB.type === 'ops') docA = applyOps(docA, expandRuns(fromB.runs));
    if (fromA.type === 'ops') docB = applyOps(docB, expandRuns(fromA.runs));
    expect(toText(docA)).toBe(toText(docB));
    expect(await a.next('ack')).toMatchObject({ type: 'ack' });

    const del = localDelete(docB, 'bobby123', 0, 2);
    b.send({ type: 'ops', runs: compressOps(del.ops) });
    const deletion = await a.next('ops');
    if (deletion.type === 'ops') docA = applyOps(docA, expandRuns(deletion.runs));
    expect(toText(docA)).toBe(toText(del.doc));

    await a.close();
    await b.close();
    await waitForRoomsUnloaded();

    // Rehydrated from Postgres after the room was dropped.
    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}`,
      headers: authed(owner),
    });
    expect(detail.json().data).toMatchObject({
      text: toText(docA),
      opCount: 12,
      vector: { alice123: 5, bobby123: 7 },
    });
    const rows = await ctx.db.query(
      'SELECT client_id, seq_start, seq_end FROM document_ops ORDER BY id',
    );
    expect(rows.rows).toHaveLength(3);

    // A reconnecting replica only receives what it is missing.
    const again = await connect(owner, docId);
    again.send({ type: 'hello', clientId: 'alice123', vector: { alice123: 5, bobby123: 5 } });
    const welcome = await again.next('welcome');
    if (welcome.type === 'welcome') {
      expect(expandRuns(welcome.runs).map((op) => `${op.id.client}:${op.id.seq}`)).toEqual([
        'bobby123:6',
        'bobby123:7',
      ]);
    }
    await again.close();
  });

  it('lets viewers follow along but not edit', async () => {
    const owner = await registerOwner(ctx.app);
    const viewer = await addMember(ctx, owner.organizationId, 'viewer');
    const docId = await createDocument(owner);
    const v = await connect(viewer, docId);
    v.send({ type: 'hello', clientId: 'viewer12', vector: {} });
    expect(await v.next('welcome')).toMatchObject({ canEdit: false });
    v.send({ type: 'ops', runs: compressOps(localInsert(createDoc(), 'viewer12', 0, 'x').ops) });
    expect(await v.next('error')).toMatchObject({ code: 'FORBIDDEN' });
    await v.close();
  });

  it('validates frames and the hello handshake', async () => {
    const owner = await registerOwner(ctx.app);
    const docId = await createDocument(owner);
    const c = await connect(owner, docId);
    c.send({ type: 'ops', runs: compressOps(localInsert(createDoc(), 'alice123', 0, 'x').ops) });
    expect(await c.next('error')).toMatchObject({ code: 'NOT_READY' });
    c.send('{not json');
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    c.send({ type: 'hello', clientId: '__proto__', vector: {} });
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    c.socket.send(Buffer.from([1, 2, 3]));
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    c.send({ type: 'ping' });
    expect(await c.next('pong')).toEqual({ type: 'pong' });
    c.send({ type: 'hello', clientId: 'alice123', vector: {} });
    await c.next('welcome');
    c.send({ type: 'hello', clientId: 'alice123', vector: {} });
    expect(await c.next('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    c.send({ type: 'presence', anchor: null, focused: true });
    const presence = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${docId}/presence`,
      headers: authed(owner),
    });
    expect(presence.json().data).toHaveLength(1);
    await c.close();
  });

  it('refuses upgrades without a session, from foreign origins, or for other tenants', async () => {
    const owner = await registerOwner(ctx.app);
    const outsider = await registerOwner(ctx.app, 'outsider');
    const docId = await createDocument(owner);
    await expect(connect({ ...owner, cookie: '' }, docId)).rejects.toThrow(/401/);
    await expect(connect(owner, docId, 'https://evil.example')).rejects.toThrow(/403/);
    await expect(connect(outsider, docId)).rejects.toThrow(/404/);
  });
});
