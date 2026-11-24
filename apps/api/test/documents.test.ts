import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  authed,
  createTestContext,
  registerOwner,
  truncateAll,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => truncateAll(ctx.db));

async function createDoc(session: Awaited<ReturnType<typeof registerOwner>>, title: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    headers: authed(session, true),
    payload: { title },
  });
}

describe('documents', () => {
  it('creates, lists and reads documents with CRDT state', async () => {
    const owner = await registerOwner(ctx.app);
    const created = await createDoc(owner, '  Launch plan ');
    expect(created.statusCode).toBe(201);
    const doc = created.json().data;
    expect(doc.title).toBe('Launch plan');

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/documents?limit=10',
      headers: authed(owner),
    });
    expect(list.json().data.map((d: { id: string }) => d.id)).toEqual([doc.id]);
    expect(list.json().meta).toEqual({ count: 1, limit: 10 });

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${doc.id}`,
      headers: authed(owner),
    });
    expect(detail.json().data).toMatchObject({ id: doc.id, text: '', vector: {}, opCount: 0 });

    const presence = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${doc.id}/presence`,
      headers: authed(owner),
    });
    expect(presence.json().data).toEqual([]);
    const audit = await ctx.db.query(
      "SELECT target_id FROM audit_log WHERE action = 'document.create'",
    );
    expect(audit.rows[0].target_id).toBe(doc.id);
  });

  it('enforces RBAC: viewers read but cannot create', async () => {
    const owner = await registerOwner(ctx.app);
    const viewer = await addMember(ctx, owner.organizationId, 'viewer');
    const denied = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: authed(viewer, true),
      payload: { title: 'x' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/documents', headers: authed(viewer) }))
        .statusCode,
    ).toBe(200);
  });

  it('isolates tenants', async () => {
    const a = await registerOwner(ctx.app, 'a');
    const b = await registerOwner(ctx.app, 'b');
    const doc = (await createDoc(a, 'Secret')).json().data;
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${doc.id}`,
      headers: authed(b),
    });
    expect(read.statusCode).toBe(404);
    const presence = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${doc.id}/presence`,
      headers: authed(b),
    });
    expect(presence.statusCode).toBe(404);
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: authed(b),
    });
    expect(list.json().data).toEqual([]);
  });

  it('validates ids, titles and limits', async () => {
    const owner = await registerOwner(ctx.app);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/api/v1/documents/not-a-uuid',
          headers: authed(owner),
        })
      ).statusCode,
    ).toBe(400);
    expect((await createDoc(owner, '')).statusCode).toBe(400);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/api/v1/documents?limit=1000',
          headers: authed(owner),
        })
      ).statusCode,
    ).toBe(400);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/documents' })).statusCode).toBe(
      401,
    );
  });
});
