import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './api/auth';
import { AppShell } from './components/AppShell';
import { NAV_ITEMS } from './components/navigation';
import { DocumentsPage } from './pages/DocumentsPage';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';
import { PlannedPage } from './pages/PlannedPage';
import { RegisterPage } from './pages/RegisterPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <p className="muted centered">Loading…</p>;
  return me ? <>{children}</> : <Navigate to="/login" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="docs" replace />} />
        <Route path="docs" element={<DocumentsPage />} />
        <Route path="docs/:id" element={<EditorPage />} />
        {NAV_ITEMS.filter((item) => item.status === 'planned').map((item) => (
          <Route
            key={item.path}
            path={item.path.replace('/app/', '')}
            element={<PlannedPage item={item} />}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/app/docs" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
