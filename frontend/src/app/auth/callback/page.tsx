'use client';
/**
 * PrepVista — Google OAuth Callback Handler
 * Processes the Supabase OAuth redirect and syncs the session.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeGoogleCode, getSupabase } from '@/lib/supabase';
import { createGoogleCallback } from '@/lib/oauth-callback';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function AuthCallbackLogic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [retryable, setRetryable] = useState(false);
  const attemptRef = useRef<ReturnType<typeof createGoogleCallback> | null>(null);

  useEffect(() => {
    if (!attemptRef.current) {
      const error = searchParams.get('error');
      attemptRef.current = createGoogleCallback({
        code: searchParams.get('code'),
        flowError: error ? { code: error, status: ['server_error', 'temporarily_unavailable'].includes(error) ? 503 : 400 } : undefined,
        exchangeCode: exchangeGoogleCode,
        getSession: () => getSupabase().auth.getSession(),
        setTokens: (access, refresh) => api.setTokens(access, refresh),
        completeLogin: () => api.completeOAuthLogin(), refreshUser,
        getMe: () => api.getMe(),
      });
    }
    void attemptRef.current().then(result => {
      if (result.kind === 'success') router.push(result.path);
      else if (result.kind === 'fresh-sign-in') router.push('/login?error=google_failed');
      else setRetryable(true);
    });
  }, [refreshUser, router, searchParams]);

  return retryable ? (
    <div role="alert" className="p-4 text-center">
      Google sign-in is temporarily unavailable. Your session is preserved.{' '}
      <button onClick={() => {
        setRetryable(false);
        void attemptRef.current?.().then(result => {
          if (result.kind === 'success') router.push(result.path);
          else if (result.kind === 'fresh-sign-in') router.push('/login?error=google_failed');
          else setRetryable(true);
        });
      }}>Retry</button>{' '}
      <button onClick={() => router.push('/login')}>Start a fresh sign-in</button>
    </div>
  ) : null;
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
