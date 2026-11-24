import type { Peer } from '@quillsync/shared';
import type { Logger } from 'pino';
import type { OpLogStore } from './op-log.repository.js';
import { loadRoom, type Room, type RoomSnapshot } from './room.js';

/**
 * Process-local registry of active rooms. A room is loaded from the op log on
 * first acquire and dropped when its last connection releases it. Single node
 * only: multi-node ownership is planned (QS-053, QS-054).
 */
export interface RoomRegistry {
  acquire(documentId: string, organizationId: string): Promise<Room>;
  release(documentId: string): Promise<void>;
  snapshot(documentId: string, organizationId: string): Promise<RoomSnapshot>;
  peers(documentId: string): Promise<Peer[]>;
  loadedCount(): number;
}

interface Entry {
  readonly room: Promise<Room>;
  refs: number;
}

export function createRoomRegistry(store: OpLogStore, logger: Logger): RoomRegistry {
  const entries = new Map<string, Entry>();

  function load(documentId: string, organizationId: string): Promise<Room> {
    return loadRoom({ documentId, organizationId, store, logger: logger.child({ documentId }) });
  }

  return {
    async acquire(documentId, organizationId) {
      let entry = entries.get(documentId);
      if (!entry) {
        entry = { room: load(documentId, organizationId), refs: 0 };
        entries.set(documentId, entry);
        entry.room.catch(() => entries.delete(documentId));
      }
      entry.refs += 1;
      return entry.room;
    },

    async release(documentId) {
      const entry = entries.get(documentId);
      if (!entry) return;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      const room = await entry.room;
      await room.idle();
      if (entry.refs === 0 && entries.get(documentId) === entry) entries.delete(documentId);
    },

    async snapshot(documentId, organizationId) {
      const entry = entries.get(documentId);
      const room = entry ? await entry.room : await load(documentId, organizationId);
      return room.snapshot();
    },

    async peers(documentId) {
      const entry = entries.get(documentId);
      return entry ? (await entry.room).peers() : [];
    },

    loadedCount() {
      return entries.size;
    },
  };
}
