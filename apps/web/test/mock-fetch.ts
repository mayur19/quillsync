import { vi } from 'vitest';

export const ME = {
  user: { id: 'u1', email: 'ada@northwind.test', displayName: 'Ada Lovelace' },
  organization: { id: 'o1', name: 'Northwind Editorial', slug: 'northwind' },
  role: 'owner',
  permissions: ['document:read', 'document:create', 'document:edit'],
  csrfToken: 'csrf-token',
};

type Route = { status: number; data?: unknown; error?: { code: string; message: string } };

/** Routes fetch calls by "METHOD path" to canned envelope responses. */
export function mockFetch(routes: Record<string, Route>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const route = routes[key] ?? {
      status: 404,
      error: { code: 'NOT_FOUND', message: `no mock for ${key}` },
    };
    return new Response(JSON.stringify({ data: route.data ?? null, error: route.error ?? null }), {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
