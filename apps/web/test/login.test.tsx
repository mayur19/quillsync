import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/api/auth';
import { LoginPage } from '../src/pages/LoginPage';
import { mockFetch, ME } from './mock-fetch';

afterEach(() => vi.unstubAllGlobals());

function renderLogin() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app/docs" element={<p>documents screen</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('login page', () => {
  it('shows the server error message on bad credentials', async () => {
    mockFetch({
      'GET /api/v1/auth/me': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in' },
      },
      'POST /api/v1/auth/login': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect' },
      },
    });
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@northwind.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
  });

  it('navigates to documents after signing in', async () => {
    mockFetch({
      'GET /api/v1/auth/me': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in' },
      },
      'POST /api/v1/auth/login': { status: 200, data: ME },
    });
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@northwind.test');
    await userEvent.type(screen.getByLabelText('Password'), 'quillsync-demo-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('documents screen')).toBeInTheDocument();
  });

  it('reports network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.test');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
});
