import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/api/auth';
import { AppShell } from '../src/components/AppShell';
import { NAV_ITEMS } from '../src/components/navigation';
import { PlannedPage } from '../src/pages/PlannedPage';
import { mockFetch, ME } from './mock-fetch';

afterEach(() => vi.restoreAllMocks());

describe('app shell', () => {
  it('shows live and planned sections and signs out', async () => {
    const fetchMock = mockFetch({
      'GET /api/v1/auth/me': { status: 200, data: ME },
      'POST /api/v1/auth/logout': { status: 200, data: { signedOut: true } },
    });
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/app/docs']}>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route path="docs" element={<p>doc list</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('Northwind Editorial')).toBeInTheDocument();
    const planned = NAV_ITEMS.filter((item) => item.status === 'planned');
    expect(screen.getAllByText('Planned')).toHaveLength(planned.length);
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveClass('active');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const logoutCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect((logoutCall![1]!.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token');
  });

  it('explains planned sections with their ticket', () => {
    render(<PlannedPage item={NAV_ITEMS.find((i) => i.ticket === 'QS-101')!} />);
    expect(screen.getByRole('heading', { name: /Search/ })).toBeInTheDocument();
    expect(screen.getByText('QS-101')).toBeInTheDocument();
  });
});
