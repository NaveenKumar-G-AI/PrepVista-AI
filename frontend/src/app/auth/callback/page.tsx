'use client';
/**
 * PrepVista — Google OAuth Callback Handler
 * Processes the Supabase OAuth redirect and syncs the session.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function AuthCallbackLogic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const errorParam = searchParams.get('error') || '';
        const errorDescription = searchParams.get('error_description') || '';
        if (errorParam) {
          const suffix = errorDescription ? `&error_description=${encodeURIComponent(errorDescription)}` : '';
          router.push(`/login?error=google_failed${suffix}`);
          return;
        }

        const sb = getSupabase();
        const code = searchParams.get('code');
        let session = null;
        if (code) {
          const { data, error } = await sb.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
          session = data.session || null;
        } else {
          const { data: { session: existingSession }, error } = await sb.auth.getSession();
          if (error) {
            throw error;
          }
          session = existingSession || null;
        }
        if (!session) {
          router.push('/login?error=google_failed');
          return;
        }
        api.setTokens(session.access_token, session.refresh_token || '');
        await api.completeOAuthLogin();
        await refreshUser();
        // Route org admins to their admin workspace, not the interview dashboard
        // Route org students to their dedicated student workspace
        try {
          const me = await api.getMe<{ is_org_admin?: boolean; org_student?: boolean }>();
          if (me.is_org_admin) {
            router.push('/org-admin');
            return;
          }
          if (me.org_student) {
            router.push('/student-dashboard');
            return;
          }
        } catch { /* fall through to default */ }
        router.push('/dashboard');
      } catch (error) {
        try { await getSupabase().auth.signOut(); } catch { /* ignore */ }
        api.clearTokens();
        const message = error instanceof Error ? error.message : 'Google sign-in could not be completed.';
        router.push(`/login?error=google_failed&error_description=${encodeURIComponent(message)}`);
      }
    };
    void handleCallback();
  }, [refreshUser, router, searchParams]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center surface-primary">
      <Suspense fallback={null}>
        <AuthCallbackLogic />
      </Suspense>
      <div className="text-center fade-in">
        <div className="w-12 h-12 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-secondary">Signing you in...</p>
      </div>
    </div>
  );
}
