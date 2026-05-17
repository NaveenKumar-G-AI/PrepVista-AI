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
import { api, ApiUser } from '@/lib/api';
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
  const initDone = useRef(false);
  const userRef = useRef<User | null>(null);
  const refreshingRef = useRef(false);
  const router = useRouter();

  // Derived auth state for pages that need granular checks
  const authState: AuthState = loading ? 'loading' : user ? 'authenticated' : 'unauthenticated';

  const buildMinimalUser = (id: string, email: string): User => ({
    id,
    email,
    full_name: null,
    plan: 'free',
    active_plan: 'free',
    owned_plans: ['free'],
    expired_plans: [],
    highest_owned_plan: 'free',
    effective_plan: 'free',
    is_admin: false,
    is_org_admin: false,
    org_student: false,
    organization_id: null,
    premium_override: false,
    subscription_status: 'none',
    onboarding_completed: false,
    prep_goal: null,
    theme_preference: 'system',
    usage: {
      plan: 'free',
      used: 0,
      limit: 2,
      remaining: 2,
      is_unlimited: false,
      period_start: null,
    },
  });

  const refreshUser = useCallback(async () => {
    // Prevent duplicate concurrent refresh calls
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      api.loadTokens();
      if (!api.getToken()) {
        setUser(null);
        setLoading(false);
        return;
      }
      const data = await api.getMe<User>();
      userRef.current = data;
      setUser(data);
    } catch {
      setUser(null);
      api.clearTokens();
    } finally {
      setLoading(false);
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
            api.clearTokens();
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
    const data = await api.login(email, password);
    if (data.user?.id && data.user?.email) {
      setUser(buildMinimalUser(data.user.id, data.user.email));
    }
    // Fetch full role data before navigating
    await refreshUser();
    // Route to the correct workspace based on role (use ref to avoid second API call)
    if (userRef.current?.is_org_admin) {
      router.push('/org-admin');
    } else if (userRef.current?.org_student) {
      router.push('/student-dashboard');
    } else {
      router.push('/dashboard');
    }
  };

  const signup = async (email: string, password: string, fullName: string, verificationCode: string) => {
    setLoading(true);
    const data = await api.signup(email, password, fullName, verificationCode);
    if (data.user?.id && data.user?.email) {
      setUser(buildMinimalUser(data.user.id, data.user.email));
    }
    await refreshUser();
    // Route to the correct workspace based on role (use ref to avoid second API call)
    if (userRef.current?.is_org_admin) {
      router.push('/org-admin');
    } else if (userRef.current?.org_student) {
      router.push('/student-dashboard');
    } else {
      router.push('/dashboard');
    }
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
    api.logout();
    try { getSupabase().auth.signOut(); } catch { /* ok */ }
    setUser(null);
    setLoading(false);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, loading, authState, login, signup, loginWithGoogle, logout, refreshUser, applyOptimisticPlan }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
