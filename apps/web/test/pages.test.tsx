import { compressOps, createDoc, localInsert } from '@quillsync/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { AuthProvider } from '../src/api/auth';
import { FakeSocket } from './fake-socket';
import { mockFetch, ME } from './mock-fetch';

const DOC = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Q3 launch plan',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('routing', () => {
  it('redirects anonymous visitors to the login page', async () => {
    mockFetch({
      'GET /api/v1/auth/me': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in' },
      },
    });
    renderAt('/app/docs');
    expect(
      await screen.findByRole('heading', { name: 'Sign in to quillsync' }),
    ).toBeInTheDocument();
  });

  it('renders planned sections inside the shell', async () => {
    mockFetch({ 'GET /api/v1/auth/me': { status: 200, data: ME } });
    renderAt('/app/comments');
    expect(await screen.findByText('QS-080')).toBeInTheDocument();
  });
});

describe('documents page', () => {
  it('lists documents and creates a new one', async () => {
    mockFetch({
      'GET /api/v1/auth/me': { status: 200, data: ME },
      'GET /api/v1/documents': { status: 200, data: [DOC] },
      'POST /api/v1/documents': {
        status: 201,
        data: { ...DOC, id: '22222222-2222-4222-8222-222222222222', title: 'New' },
      },
      'GET /api/v1/documents/22222222-2222-4222-8222-222222222222': {
        status: 200,
        data: { ...DOC, title: 'New', text: '', vector: {}, opCount: 0 },
      },
    });
    vi.stubGlobal('WebSocket', FakeSocket);
    renderAt('/app/docs');
    expect(await screen.findByText('Q3 launch plan')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New document title'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(await screen.findByRole('heading', { name: 'New' })).toBeInTheDocument();
  });

  it('shows load errors', async () => {
    mockFetch({
      'GET /api/v1/auth/me': { status: 200, data: ME },
      'GET /api/v1/documents': {
        status: 500,
        error: { code: 'INTERNAL', message: 'Something went wrong' },
      },
    });
    renderAt('/app/docs');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('register page', () => {
  it('registers and signs in', async () => {
    mockFetch({
      'GET /api/v1/auth/me': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in' },
      },
      'POST /api/v1/auth/register': { status: 202, data: { status: 'accepted', message: 'ok' } },
      'POST /api/v1/auth/login': { status: 200, data: ME },
      'GET /api/v1/documents': { status: 200, data: [] },
    });
    renderAt('/register');
    await userEvent.type(await screen.findByLabelText('Workspace name'), 'Acme');
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@acme.test');
    await userEvent.type(screen.getByLabelText(/Password/), 'long-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('No documents yet.')).toBeInTheDocument();
  });

  it('shows an error when sign-in after registration fails', async () => {
    mockFetch({
      'GET /api/v1/auth/me': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in' },
      },
      'POST /api/v1/auth/register': { status: 202, data: { status: 'accepted', message: 'ok' } },
      'POST /api/v1/auth/login': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect' },
      },
    });
    renderAt('/register');
    await userEvent.type(await screen.findByLabelText('Workspace name'), 'Acme');
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@acme.test');
    await userEvent.type(screen.getByLabelText(/Password/), 'long-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
  });
});

describe('editor page', () => {
  it('syncs text over the socket and sends local edits', async () => {
    const sockets: FakeSocket[] = [];
    class TrackingSocket extends FakeSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    }
    vi.stubGlobal('WebSocket', TrackingSocket);
    mockFetch({
      'GET /api/v1/auth/me': { status: 200, data: ME },
      [`GET /api/v1/documents/${DOC.id}`]: {
        status: 200,
        data: { ...DOC, text: 'hello', vector: {}, opCount: 5 },
      },
    });
    renderAt(`/app/docs/${DOC.id}`);
    expect(await screen.findByRole('heading', { name: 'Q3 launch plan' })).toBeInTheDocument();
    const socket = sockets.at(-1)!;
    expect(socket.url).toMatch(new RegExp(`/api/v1/documents/${DOC.id}/sync$`));
    act(() => socket.open());
    act(() =>
      socket.receive({
        type: 'welcome',
        vector: { server01: 5 },
        runs: compressOps(localInsert(createDoc(), 'server01', 0, 'hello').ops),
        peers: [
          {
            clientId: 'grace123',
            userId: 'u2',
            displayName: 'Grace',
            color: 'red',
            anchor: null,
            focused: true,
          },
        ],
        canEdit: true,
      }),
    );
    const area = screen.getByLabelText('Document text') as HTMLTextAreaElement;
    expect(area.value).toBe('hello');
    expect(screen.getByRole('status')).toHaveTextContent('Live');
    expect(screen.getByLabelText('People editing this document')).toHaveTextContent('Grace');
    expect(screen.getByTestId('remote-caret')).toHaveTextContent('Grace');

    area.focus();
    fireEvent.change(area, { target: { value: 'hello!' } });
    expect(socket.sentOfType('ops')).toHaveLength(1);
    fireEvent.select(area);
    fireEvent.scroll(area);
    fireEvent.blur(area);
    expect(socket.sentOfType('presence').length).toBeGreaterThan(0);

    area.focus();
    area.setSelectionRange(6, 6);
    fireEvent.select(area);
    act(() =>
      socket.receive({
        type: 'ops',
        runs: [{ k: 'i', client: 'grace123', seq: 1, lamport: 50, origin: null, text: '>> ' }],
        from: 'grace123',
      }),
    );
    expect(area.value).toBe('>> hello!');
    expect(area.selectionStart).toBe(9);
    act(() => socket.drop());
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });

  it('shows an error for documents that cannot be opened', async () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    mockFetch({ 'GET /api/v1/auth/me': { status: 200, data: ME } });
    renderAt(`/app/docs/${DOC.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('no mock');
  });
});
