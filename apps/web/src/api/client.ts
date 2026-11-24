import type { DocumentDetail, DocumentSummary, Permission, Role } from '@quillsync/shared';

export interface Me {
  readonly user: { id: string; email: string; displayName: string };
  readonly organization: { id: string; name: string; slug: string };
  readonly role: Role;
  readonly permissions: readonly Permission[];
  readonly csrfToken: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** fetch wrapper: JSON envelope, cookie session, CSRF header on mutations. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  const payload = (await response.json().catch(() => null)) as {
    data: T;
    error: { code: string; message: string } | null;
  } | null;
  if (!response.ok || !payload || payload.error) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return payload.data;
}

export const api = {
  me: () => request<Me>('GET', '/api/v1/auth/me'),
  login: (email: string, password: string) =>
    request<Me>('POST', '/api/v1/auth/login', { email, password }),
  register: (input: {
    organizationName: string;
    displayName: string;
    email: string;
    password: string;
  }) => request<{ status: string; message: string }>('POST', '/api/v1/auth/register', input),
  logout: () => request<{ signedOut: boolean }>('POST', '/api/v1/auth/logout'),
  listDocuments: () => request<DocumentSummary[]>('GET', '/api/v1/documents'),
  createDocument: (title: string) =>
    request<DocumentSummary>('POST', '/api/v1/documents', { title }),
  getDocument: (id: string) => request<DocumentDetail>('GET', `/api/v1/documents/${id}`),
};

export function syncUrl(documentId: string, location: Location = window.location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/api/v1/documents/${documentId}/sync`;
}
