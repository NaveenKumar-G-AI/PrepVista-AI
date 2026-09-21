'use client';
/**
 * PrepVista — Auth Context Provider
 * Global authentication state with email/password + Google OAuth support.
 *
 * KEY DESIGN: `loading` stays TRUE until /auth/me returns with full role data.
 * This prevents unauthorized page flash, wrong dashboard rendering, and sidebar
 * flickering during refresh. No protected page should render until loading=false.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { api, ApiUser, AUTH_REQUIRED_EVENT } from '@/lib/api';
import { deriveUsageForPlan } from '@/lib/plan-usage';
import { getSupabase } from '@/lib/supabase';
import { usePathname, useRouter } from 'next/navigation';

export type User = ApiUser;

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Unavailable preserves credentials but exposes no unverified role data. */
  authState: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string, verificationCode: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  applyOptimisticPlan: (plan: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const initDone = useRef(false);
  const userRef = useRef<User | null>(null);
  const refreshingRef = useRef(false);
  const authEpochRef = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const isPublicReport = pathname.startsWith('/report/shared/');

  // Derived auth state for pages that need granular checks
  const authState: AuthState = loading ? 'loading' : unavailable ? 'unavailable' : user ? 'authenticated' : 'unauthenticated';

  const refreshUser = useCallback(async () => {
    // Prevent duplicate concurrent refresh calls
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    const epoch = authEpochRef.current;
    try {
      api.loadTokens();
      if (!await api.ensureAccessToken()) {
        if (epoch !== authEpochRef.current) return;
        userRef.current = null;
        setUser(null);
        setUnavailable(false);
        return;
      }
      const data = await api.getMe<User>();
      if (epoch !== authEpochRef.current || !api.getToken()) return;
      userRef.current = data;
      setUser(data);
      setUnavailable(false);
    } catch (error) {
      if (epoch !== authEpochRef.current) return;
      userRef.current = null;
      setUser(null);
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        api.clearTokens();
        setUnavailable(false);
      } else {
        // Failure to fetch roles is not evidence that the session is invalid.
        // Hide protected data while keeping credentials and local drafts intact.
        setUnavailable(true);
      }
    } finally {
      if (epoch === authEpochRef.current) setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  const applyOptimisticPlan = useCallback((plan: string) => {
    const normalizedPlan = (plan || 'free').toLowerCase();
    setUser(current => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        plan: normalizedPlan,
        active_plan: normalizedPlan,
        usage: deriveUsageForPlan(current.usage, normalizedPlan) || current.usage,
      };
    });
  }, []);

  // Listen for Supabase auth changes (Google OAuth callback)
  useEffect(() => {
    try {
      const sb = getSupabase();
      const { data: { subscription } } = sb.auth.onAuthStateChange(
        async (event, session) => {
          // Only react to explicit sign-in/sign-out.
          // TOKEN_REFRESHED and INITIAL_SESSION should NOT trigger loading/re-render.
          if (event === 'SIGNED_IN' && session) {
            api.setTokens(session.access_token, session.refresh_token || '');
            if (typeof window !== 'undefined' && window.location.pathname === '/auth/callback') {
              return;
            }
            // Only trigger loading + refresh for genuine first-time sign-ins.
            // If user is already authenticated, skip to avoid a race condition where
            // loading gets set to true but refreshUser() is a no-op (due to
            // refreshingRef guard), leaving loading stuck forever.
            if (!userRef.current) {
              setLoading(true);
            }
            void refreshUser();
          } else if (event === 'TOKEN_REFRESHED' && session) {
            // Silently update tokens without triggering any re-render
            api.setTokens(session.access_token, session.refresh_token || '');
          } else if (event === 'SIGNED_OUT') {
            authEpochRef.current++;
            userRef.current = null;
            api.clearTokens();
            setUser(null);
            setUnavailable(false);
            setLoading(false);
          }
        }
      );
      return () => subscription.unsubscribe();
    } catch {
      return;
    }
  }, [refreshUser]);

  useEffect(() => {
    const handleAuthenticationRequired = () => {
      authEpochRef.current++;
      userRef.current = null;
      setUser(null);
      setUnavailable(false);
      setLoading(false);
      if (!isPublicReport) router.replace('/login');
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
  }, [router, isPublicReport]);

  useEffect(() => {
    // Prevent double-init in React StrictMode
    if (initDone.current) return;
    initDone.current = true;

    const initAuth = async () => {
      try {
        const sb = getSupabase();
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          api.setTokens(session.access_token, session.refresh_token || '');
          if (typeof window !== 'undefined' && window.location.pathname === '/auth/callback') {
            setLoading(false);
            return;
          }
        }
      } catch {
        // Supabase not configured — fall through to token-based auth
      }
      // Always try to load stored tokens (incl. localStorage refresh_token for session restore)
      api.loadTokens();
      await refreshUser();
    };
    initAuth();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      await api.login(email, password);
      // Fetch full role data before navigating
      await refreshUser();
      if (!userRef.current) return;
      // Route to the correct workspace based on role (use ref to avoid second API call)
      if (userRef.current?.is_org_admin) {
        router.push('/org-admin');
      } else if (userRef.current?.org_student) {
        router.push('/student-dashboard');
      } else {
        router.push('/dashboard');
      }
    } finally { setLoading(false); }
  };

  const signup = async (email: string, password: string, fullName: string, verificationCode: string) => {
    setLoading(true);
    try {
      await api.signup(email, password, fullName, verificationCode);
      await refreshUser();
      if (!userRef.current) return;
      // Route to the correct workspace based on role (use ref to avoid second API call)
      if (userRef.current?.is_org_admin) {
        router.push('/org-admin');
      } else if (userRef.current?.org_student) {
        router.push('/student-dashboard');
      } else {
        router.push('/dashboard');
      }
    } finally { setLoading(false); }
  };

  const loginWithGoogle = async () => {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw new Error(error.message);
  };

  const logout = () => {
    authEpochRef.current++;
    userRef.current = null;
    api.logout();
    try { void getSupabase().auth.signOut().catch(() => {}); } catch { /* ok */ }
    setUser(null);
    setUnavailable(false);
    setLoading(false);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, loading: loading || unavailable, authState, login, signup, loginWithGoogle, logout, refreshUser, applyOptimisticPlan }}>
      {unavailable && !isPublicReport ? (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-6">
          <h1 className="text-2xl font-semibold">Account access is temporarily unavailable</h1>
          <p role="status">We could not verify your account right now. Your sign-in details and saved work are preserved. Retry when the service or your connection recovers.</p>
          <div className="flex flex-wrap gap-4">
            <button type="button" className="btn-primary" disabled={loading} onClick={() => void refreshUser()}>{loading ? 'Checking account…' : 'Retry account access'}</button>
            <button type="button" className="btn-secondary" onClick={logout}>Sign out</button>
          </div>
        </main>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
