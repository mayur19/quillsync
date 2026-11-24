import { randomUUID } from 'node:crypto';
import {
  clientMessageSchema,
  documentIdSchema,
  hasPermission,
  type ServerMessage,
} from '@quillsync/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { requirePermission, type AuthContext } from '../../http/auth-guard.js';
import { forbidden, notFound } from '../../http/errors.js';
import { findDocument } from '../documents/documents.repository.js';
import type { Participant, Room } from './room.js';

const paramsSchema = z.object({ id: documentIdSchema });
const HEARTBEAT_MS = 30_000;

interface Admission {
  readonly auth: AuthContext;
  readonly documentId: string;
}

const admissions = new WeakMap<FastifyRequest, Admission>();

function sendJson(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/**
 * GET /api/v1/documents/:id/sync upgrades to the sync protocol. Admission runs
 * as a normal HTTP hook before the upgrade: session, Origin (cross-site
 * WebSocket hijacking), tenant-scoped document lookup and read permission.
 */
export function registerSyncRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    '/api/v1/documents/:id/sync',
    {
      websocket: true,
      preValidation: async (request) => {
        const auth = requirePermission(request, 'document:read');
        if (request.headers.origin !== ctx.config.APP_ORIGIN) throw forbidden('Origin not allowed');
        const { id } = paramsSchema.parse(request.params);
        if (!(await findDocument(ctx.db, auth.organizationId, id))) throw notFound('Document');
        admissions.set(request, { auth, documentId: id });
      },
    },
    (socket, request) => handleConnection(ctx, socket, admissions.get(request)!),
  );
}

function handleConnection(ctx: AppContext, socket: WebSocket, admission: Admission): void {
  const { auth, documentId } = admission;
  const log = ctx.logger.child({ documentId, userId: auth.userId });
  const participant: Participant = {
    connectionId: randomUUID(),
    userId: auth.userId,
    displayName: auth.displayName,
    canEdit: hasPermission(auth.role, 'document:edit'),
    send: (message) => sendJson(socket, message),
  };
  const roomPromise: Promise<Room> = ctx.rooms.acquire(documentId, auth.organizationId);
  roomPromise.catch((error: unknown) => {
    log.error({ err: error }, 'failed to load room');
    participant.send({ type: 'error', code: 'INTERNAL', message: 'Document could not be loaded' });
    socket.close(1011, 'room unavailable');
  });

  let helloReceived = false;
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, HEARTBEAT_MS);
  socket.on('pong', () => {
    alive = true;
  });

  socket.on('message', (raw, isBinary) => {
    const badMessage = (message: string) =>
      participant.send({ type: 'error', code: 'BAD_MESSAGE', message });
    if (isBinary) return badMessage('Binary frames are not supported yet');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return badMessage('Frame is not valid JSON');
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) return badMessage(result.error.issues[0]?.message ?? 'Invalid message');
    const message = result.data;

    if (message.type === 'ping') return participant.send({ type: 'pong' });
    if (message.type === 'hello') {
      if (helloReceived) return badMessage('hello may only be sent once');
      helloReceived = true;
      void roomPromise
        .then((room) => room.join(participant, message.clientId, message.vector))
        .catch(() => undefined);
      return;
    }
    if (!helloReceived) {
      return participant.send({ type: 'error', code: 'NOT_READY', message: 'Send hello first' });
    }
    if (message.type === 'ops') {
      void roomPromise
        .then((room) => room.submit(participant, message.runs))
        .catch(() => undefined);
      return;
    }
    void roomPromise
      .then((room) => room.updatePresence(participant, message.anchor, message.focused))
      .catch(() => undefined);
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    void roomPromise
      .then((room) => {
        room.leave(participant);
        return ctx.rooms.release(documentId);
      })
      .catch(() => undefined);
  });
}
