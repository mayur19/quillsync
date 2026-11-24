import {
  applyOps,
  compressOps,
  createDoc,
  localDelete,
  localInsert,
  toText,
  visibleLength,
  type DocState,
  type Op,
} from '@quillsync/shared';
import { hashPassword } from '../modules/auth/password.js';
import { createPgOpLogStore } from '../modules/collab/op-log.repository.js';
import type { Db } from './pool.js';

export const DEMO_PASSWORD = 'quillsync-demo-1';
const DEMO_ORG = { name: 'Northwind Editorial', slug: 'northwind' };
const DEMO_USERS = [
  { email: 'ada@northwind.test', displayName: 'Ada Lovelace', role: 'owner' },
  { email: 'grace@northwind.test', displayName: 'Grace Hopper', role: 'editor' },
  { email: 'linus@northwind.test', displayName: 'Linus Pauling', role: 'viewer' },
] as const;

interface Turn {
  readonly clientId: string;
  readonly authorIndex: number;
  readonly ops: readonly Op[];
}

/**
 * Simulates two replicas editing concurrently and returns the batches in an
 * order that respects causality, exactly as the sync server would persist them.
 */
function simulateHistory(script: (edit: Editor) => void): { turns: Turn[]; text: string } {
  const replicas: DocState[] = [createDoc(), createDoc()];
  const clientIds = ['seedada01', 'seedgrace1'];
  const turns: Turn[] = [];
  const edit: Editor = {
    insert(replica, index, text) {
      const change = localInsert(
        replicas[replica]!,
        clientIds[replica]!,
        index ?? visibleLength(replicas[replica]!),
        text,
      );
      replicas[replica] = change.doc;
      turns.push({ clientId: clientIds[replica]!, authorIndex: replica, ops: change.ops });
    },
    remove(replica, index, length) {
      const change = localDelete(replicas[replica]!, clientIds[replica]!, index, length);
      replicas[replica] = change.doc;
      turns.push({ clientId: clientIds[replica]!, authorIndex: replica, ops: change.ops });
    },
    sync() {
      const all = turns.flatMap((turn) => turn.ops);
      replicas[0] = applyOps(replicas[0]!, all);
      replicas[1] = applyOps(replicas[1]!, all);
    },
    length: (replica) => visibleLength(replicas[replica]!),
  };
  script(edit);
  edit.sync();
  return { turns, text: toText(replicas[0]!) };
}

interface Editor {
  insert(replica: number, index: number | null, text: string): void;
  remove(replica: number, index: number, length: number): void;
  sync(): void;
  length(replica: number): number;
}

const DOCUMENTS: ReadonlyArray<{ title: string; script: (edit: Editor) => void }> = [
  {
    title: 'Q3 launch plan',
    script: (edit) => {
      edit.insert(0, null, 'Q3 launch plan\n\nGoals:\n- Ship offline mode beta\n');
      edit.sync();
      edit.insert(0, null, '- Publish the pricing page\n');
      edit.insert(1, null, '- Run two usability sessions\n'); // concurrent with Ada
      edit.sync();
      edit.insert(1, null, '\nOwner: Grace. Review every Thursday.\n');
    },
  },
  {
    title: 'Style guide',
    script: (edit) => {
      edit.insert(0, null, 'House style\n\nUse sentence case for headings. Prefer active voice.\n');
      edit.sync();
      edit.remove(1, 44, 21); // Grace trims a sentence...
      edit.insert(0, 13, 'Draft: '); // ...while Ada prefixes the body
      edit.sync();
      edit.insert(1, null, 'Spell out numbers below ten.\n');
    },
  },
  {
    title: 'Interview notes',
    script: (edit) => {
      edit.insert(1, null, 'Interview 1 (operations lead)\n- Wants comments on paragraphs\n');
      edit.sync();
      edit.insert(0, null, '- Edits on the train with flaky signal\n');
    },
  },
];

export interface SeedSummary {
  readonly seeded: boolean;
  readonly users: number;
  readonly documents: number;
}

/** Idempotent: does nothing when the demo organization already exists. */
export async function seedDemoData(db: Db): Promise<SeedSummary> {
  const existing = await db.query('SELECT 1 FROM organizations WHERE slug = $1', [DEMO_ORG.slug]);
  if ((existing.rowCount ?? 0) > 0) return { seeded: false, users: 0, documents: 0 };

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const org = await db.query<{ id: string }>(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
    [DEMO_ORG.name, DEMO_ORG.slug],
  );
  const organizationId = org.rows[0]!.id;
  const userIds: string[] = [];
  for (const user of DEMO_USERS) {
    const inserted = await db.query<{ id: string }>(
      'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [user.email, user.displayName, passwordHash],
    );
    userIds.push(inserted.rows[0]!.id);
    await db.query('INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)', [
      organizationId,
      inserted.rows[0]!.id,
      user.role,
    ]);
  }

  const store = createPgOpLogStore(db);
  for (const spec of DOCUMENTS) {
    const doc = await db.query<{ id: string }>(
      'INSERT INTO documents (organization_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
      [organizationId, spec.title, userIds[0]],
    );
    const { turns } = simulateHistory(spec.script);
    for (const turn of turns) {
      const seqs = turn.ops.map((op) => op.id.seq);
      await store.append({
        documentId: doc.rows[0]!.id,
        organizationId,
        clientId: turn.clientId,
        seqStart: Math.min(...seqs),
        seqEnd: Math.max(...seqs),
        opCount: turn.ops.length,
        runs: compressOps(turn.ops),
        authorUserId: userIds[turn.authorIndex] ?? null,
      });
    }
  }
  return { seeded: true, users: DEMO_USERS.length, documents: DOCUMENTS.length };
}

export { simulateHistory };
