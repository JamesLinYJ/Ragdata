import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { clearSession, loadSession, saveSession } from '../lib/auth';
import { login as loginRequest } from '../lib/ragflow';
import type { AuthSession } from '../types/ragflow';

const AUTO_LOGIN_EMAIL = import.meta.env.VITE_AUTO_LOGIN_EMAIL || '';
const AUTO_LOGIN_PASSWORD = import.meta.env.VITE_AUTO_LOGIN_PASSWORD || '';

type AuthContextValue = {
  session: AuthSession | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: (session: AuthSession) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [ready, setReady] = useState<boolean>(() => {
    const existingSession = loadSession();
    return Boolean(existingSession) || !AUTO_LOGIN_EMAIL || !AUTO_LOGIN_PASSWORD;
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (session || !AUTO_LOGIN_EMAIL || !AUTO_LOGIN_PASSWORD) {
        setReady(true);
        return;
      }

      try {
        const nextSession = await loginRequest(AUTO_LOGIN_EMAIL, AUTO_LOGIN_PASSWORD);
        if (cancelled) return;
        saveSession(nextSession);
        setSession(nextSession);
      } catch {
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      async login(email, password) {
        const nextSession = await loginRequest(email, password);
        saveSession(nextSession);
        setSession(nextSession);
      },
      logout() {
        clearSession();
        setSession(null);
      },
      refreshSession(nextSession) {
        saveSession(nextSession);
        setSession(nextSession);
      },
    }),
    [ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
