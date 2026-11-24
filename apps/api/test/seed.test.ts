import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, seedDemoData } from '../src/db/seed.js';
import { authed, createTestContext, login, truncateAll, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
  await truncateAll(ctx.db);
});
afterAll(async () => ctx.close());

describe('demo seed', () => {
  it('creates users and documents with converged CRDT history, idempotently', async () => {
    expect(await seedDemoData(ctx.db)).toEqual({ seeded: true, users: 3, documents: 3 });
    expect((await seedDemoData(ctx.db)).seeded).toBe(false);

    const session = await login(ctx.app, 'grace@northwind.test', DEMO_PASSWORD);
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: authed(session),
    });
    const docs = list.json().data as Array<{ id: string; title: string }>;
    expect(docs.map((d) => d.title).sort()).toEqual([
      'Interview notes',
      'Q3 launch plan',
      'Style guide',
    ]);

    const style = docs.find((d) => d.title === 'Style guide')!;
    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${style.id}`,
      headers: authed(session),
    });
    expect(detail.json().data.text).toBe(
      'House style\n\nDraft: Use sentence case for headings.\nSpell out numbers below ten.\n',
    );
  });
});
