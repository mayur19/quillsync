import {
  applyOps,
  colorForClient,
  compressOps,
  CrdtError,
  createDoc,
  expandRuns,
  opsMissingFrom,
  toText,
  vectorCovers,
  type Anchor,
  type DocState,
  type Op,
  type OpRun,
  type Peer,
  type ServerMessage,
  type StateVector,
} from '@quillsync/shared';
import type { Logger } from 'pino';
import type { OpLogStore } from './op-log.repository.js';

/** One WebSocket participant as seen by a room. */
export interface Participant {
  readonly connectionId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly canEdit: boolean;
  send(message: ServerMessage): void;
}

interface Member {
  readonly participant: Participant;
  readonly clientId: string;
  readonly peer: Peer;
}

export interface RoomSnapshot {
  readonly text: string;
  readonly vector: StateVector;
  readonly opCount: number;
}

export interface Room {
  readonly documentId: string;
  readonly size: number;
  join(participant: Participant, clientId: string, vector: StateVector): Promise<void>;
  submit(participant: Participant, runs: readonly OpRun[]): Promise<void>;
  updatePresence(participant: Participant, anchor: Anchor, focused: boolean): void;
  leave(participant: Participant): void;
  snapshot(): RoomSnapshot;
  peers(): Peer[];
  /** Resolves once all queued work has finished. */
  idle(): Promise<void>;
}

export interface RoomOptions {
  readonly documentId: string;
  readonly organizationId: string;
  readonly store: OpLogStore;
  readonly logger: Logger;
}

/**
 * Authoritative in-memory replica of one document for this process.
 *
 * All state transitions (join, submit) run through a per-room promise queue, so
 * integrate -> persist -> ack -> broadcast happens strictly one batch at a time.
 * Ops are persisted before they are acknowledged or fanned out (ADR-0021).
 */
export async function loadRoom(options: RoomOptions): Promise<Room> {
  const runs = await options.store.load(options.documentId);
  const log: Op[] = expandRuns(runs);
  let doc: DocState = applyOps(createDoc(), log);
  if (doc.pending.length > 0) {
    options.logger.error(
      { documentId: options.documentId, pending: doc.pending.length },
      'op log has gaps',
    );
  }
  const members = new Map<string, Member>();
  let queue: Promise<void> = Promise.resolve();

  function enqueue(work: () => Promise<void>): Promise<void> {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  }

  function broadcast(message: ServerMessage, exceptConnectionId: string): void {
    for (const member of members.values()) {
      if (member.participant.connectionId !== exceptConnectionId) member.participant.send(message);
    }
  }

  function reject(
    participant: Participant,
    code:
      | 'FORBIDDEN'
      | 'CLIENT_MISMATCH'
      | 'INVALID_OP'
      | 'CAUSALITY_VIOLATION'
      | 'INTERNAL'
      | 'NOT_READY',
    message: string,
  ): void {
    participant.send({ type: 'error', code, message });
  }

  async function integrate(member: Member, runs: readonly OpRun[]): Promise<void> {
    const { participant, clientId } = member;
    if (runs.some((run) => run.client !== clientId)) {
      return reject(
        participant,
        'CLIENT_MISMATCH',
        'Ops must be authored by the connection client id',
      );
    }
    const fresh = expandRuns(runs).filter((op) => !vectorCovers(doc.vector, op.id));
    if (fresh.length === 0) {
      participant.send({ type: 'ack', vector: doc.vector });
      return;
    }
    let next: DocState;
    try {
      next = applyOps(doc, fresh);
    } catch (error) {
      if (error instanceof CrdtError) return reject(participant, 'INVALID_OP', error.message);
      throw error;
    }
    if (next.pending.length > 0) {
      // A well-behaved client only references ops the server already has.
      return reject(
        participant,
        'CAUSALITY_VIOLATION',
        'Batch depends on ops the server has not seen',
      );
    }
    const seqs = fresh.map((op) => op.id.seq);
    const compressed = compressOps(fresh);
    await options.store.append({
      documentId: options.documentId,
      organizationId: options.organizationId,
      clientId,
      seqStart: Math.min(...seqs),
      seqEnd: Math.max(...seqs),
      opCount: fresh.length,
      runs: compressed,
      authorUserId: participant.userId,
    });
    doc = next;
    log.push(...fresh);
    participant.send({ type: 'ack', vector: doc.vector });
    broadcast({ type: 'ops', runs: compressed, from: clientId }, participant.connectionId);
  }

  return {
    documentId: options.documentId,
    get size() {
      return members.size;
    },

    join(participant, clientId, vector) {
      return enqueue(async () => {
        const peer: Peer = {
          clientId,
          userId: participant.userId,
          displayName: participant.displayName,
          color: colorForClient(clientId),
          anchor: null,
          focused: false,
        };
        const others = [...members.values()].map((m) => m.peer);
        members.set(participant.connectionId, { participant, clientId, peer });
        participant.send({
          type: 'welcome',
          vector: doc.vector,
          runs: compressOps(opsMissingFrom(log, vector)),
          peers: others,
          canEdit: participant.canEdit,
        });
        broadcast({ type: 'presence', peer }, participant.connectionId);
      });
    },

    submit(participant, runs) {
      return enqueue(async () => {
        const member = members.get(participant.connectionId);
        if (!member) return reject(participant, 'NOT_READY', 'Send hello before ops');
        if (!participant.canEdit)
          return reject(participant, 'FORBIDDEN', 'Your role cannot edit this document');
        try {
          await integrate(member, runs);
        } catch (error) {
          options.logger.error(
            { err: error, documentId: options.documentId },
            'failed to integrate batch',
          );
          reject(participant, 'INTERNAL', 'Could not save changes; they will be retried');
        }
      });
    },

    updatePresence(participant, anchor, focused) {
      const member = members.get(participant.connectionId);
      if (!member) return;
      const peer: Peer = { ...member.peer, anchor, focused };
      members.set(participant.connectionId, { ...member, peer });
      broadcast({ type: 'presence', peer }, participant.connectionId);
    },

    leave(participant) {
      const member = members.get(participant.connectionId);
      if (!member) return;
      members.delete(participant.connectionId);
      broadcast({ type: 'peer-left', clientId: member.clientId }, participant.connectionId);
    },

    snapshot() {
      return { text: toText(doc), vector: doc.vector, opCount: log.length };
    },

    peers() {
      return [...members.values()].map((m) => m.peer);
    },

    idle() {
      return queue;
    },
  };
}
