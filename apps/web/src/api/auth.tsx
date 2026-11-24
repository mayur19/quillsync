import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setCsrfToken, type Me } from './client';

interface AuthValue {
  readonly me: Me | null;
  readonly loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const accept = useCallback((value: Me | null) => {
    setCsrfToken(value?.csrfToken ?? null);
    setMe(value);
  }, []);

  useEffect(() => {
    api
      .me()
      .then(accept)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401))
          console.error('session check failed', error);
        accept(null);
      })
      .finally(() => setLoading(false));
  }, [accept]);

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loading,
      signIn: async (email, password) => accept(await api.login(email, password)),
      signOut: async () => {
        await api.logout().catch(() => undefined);
        accept(null);
      },
    }),
    [me, loading, accept],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
