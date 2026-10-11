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
import { useRouter } from 'next/navigation';

export type User = ApiUser;

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Granular auth state: 'loading' | 'authenticated' | 'unauthenticated' */
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
  const [authError, setAuthError] = useState('');
  const initDone = useRef(false);
  const userRef = useRef<User | null>(null);
  const profileRevisionRef = useRef(0);
  const router = useRouter();

  // Derived auth state for pages that need granular checks
  const awaitingProfile = loading || (!!authError && !user);
  const authState: AuthState = awaitingProfile ? 'loading' : user ? 'authenticated' : 'unauthenticated';

  const refreshUser = useCallback(async () => {
    const revision = ++profileRevisionRef.current;
    try {
      if (!await api.restoreSession()) {
        if (revision !== profileRevisionRef.current) return;
        userRef.current = null;
        setUser(null);
        setAuthError('');
        setLoading(false);
        return;
      }
      const data = await api.getMe<User>(true);
      if (revision !== profileRevisionRef.current) return;
      userRef.current = data;
      setUser(data);
      setAuthError('');
    } catch (error) {
      if (revision !== profileRevisionRef.current) return;
      if ((error as { status?: number })?.status === 401) {
        userRef.current = null;
        setUser(null);
        api.clearTokens();
        setAuthError('');
      } else {
        // Keep the last authoritative role context. During cold start, keep
        // protected-page guards waiting rather than inventing a free profile.
        setAuthError('Your account could not be loaded. Please retry.');
      }
      throw error;
    } finally {
      if (revision === profileRevisionRef.current) setLoading(false);
    }
  }, []);

  const applyOptimisticPlan = useCallback((plan: string) => {
    const normalizedPlan = (plan || 'free').toLowerCase();
    profileRevisionRef.current += 1;
    setUser(current => {
      if (!current) {
        return current;
      }
      const updated = {
        ...current,
        plan: normalizedPlan,
        active_plan: normalizedPlan,
        usage: deriveUsageForPlan(current.usage, normalizedPlan) || current.usage,
      };
      userRef.current = updated;
      return updated;
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
            void refreshUser().catch(() => { /* The provider displays retry. */ });
          } else if (event === 'TOKEN_REFRESHED' && session) {
            // Silently update tokens without triggering any re-render
            api.setTokens(session.access_token, session.refresh_token || '');
          } else if (event === 'SIGNED_OUT') {
            profileRevisionRef.current += 1;
            api.clearTokens();
            userRef.current = null;
            setAuthError('');
            setUser(null);
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
      profileRevisionRef.current += 1;
      userRef.current = null;
      setUser(null);
      setLoading(false);
      setAuthError('');
      router.replace('/login');
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
  }, [router]);

  useEffect(() => {
    // Prevent double-init in React StrictMode
    if (initDone.current) return;
    initDone.current = true;

    const initAuth = async () => {
      if (window.location.pathname === '/auth/callback') {
        setLoading(false);
        return;
      }
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
      await refreshUser().catch(() => { /* The provider displays retry. */ });
    };
    initAuth();
  }, [refreshUser]);

  const routeToWorkspace = () => {
    const profile = userRef.current;
    if (!profile) return;
    if (profile.is_admin || profile.premium_override) {
      router.push('/admin');
    } else if (profile.is_org_admin) {
      router.push('/org-admin');
    } else if (profile.org_student) {
      router.push('/student-dashboard');
    } else {
      router.push('/dashboard');
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    await api.login(email, password);
    userRef.current = null;
    setUser(null);
    await refreshUser();
    routeToWorkspace();
  };

  const signup = async (email: string, password: string, fullName: string, verificationCode: string) => {
    setLoading(true);
    await api.signup(email, password, fullName, verificationCode);
    userRef.current = null;
    setUser(null);
    await refreshUser();
    routeToWorkspace();
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
    profileRevisionRef.current += 1;
    api.logout();
    try { getSupabase().auth.signOut(); } catch { /* ok */ }
    setUser(null);
    userRef.current = null;
    setAuthError('');
    setLoading(false);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, loading: awaitingProfile, authState, login, signup, loginWithGoogle, logout, refreshUser, applyOptimisticPlan }}>
      {authError && (
        <div role="alert" className="p-4 text-center">
          {authError}{' '}
          <button onClick={() => { void refreshUser().catch(() => { /* Keep retry available. */ }); }}>Retry</button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
