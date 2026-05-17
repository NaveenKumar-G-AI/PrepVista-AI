'use client';
/**
 * PrepVista — Login / Signup Page
 * Email/password + Google OAuth sign-in.
 * Wrapped in Suspense to satisfy Next.js 16 useSearchParams() requirement.
 */

import { useEffect, useState, FormEvent, Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { BrandLogo } from '@/components/brand-logo';
import { api, ApiPublicGrowth } from '@/lib/api';

const LaunchOfferBanner = dynamic(
  () => import('@/components/launch-offer-banner').then(mod => mod.LaunchOfferBanner),
  { ssr: false }
);

function LoginForm() {
  const searchParams = useSearchParams();
  const queryMode = searchParams.get('mode');
  const isSignupMode = queryMode === 'signup';
  const queryError = searchParams.get('error');
  const queryErrorDescription = searchParams.get('error_description');
  const [isSignup, setIsSignup] = useState(isSignupMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicGrowth, setPublicGrowth] = useState<ApiPublicGrowth | null>(null);
  const { login, signup, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const hasToken = !!(
      sessionStorage.getItem('pv_access_token') || 
      localStorage.getItem('pv_refresh_token') || 
      sessionStorage.getItem('pv_refresh_token')
    );
    if (hasToken) {
      router.replace('/dashboard');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  useEffect(() => {
    setIsSignup(isSignupMode);
    if (!isSignupMode) {
      setAwaitingVerification(false);
      setVerificationCode('');
      setVerificationMessage('');
    }
  }, [isSignupMode]);

  useEffect(() => {
    if (queryError === 'google_failed') {
      const detail = queryErrorDescription
        ? decodeURIComponent(queryErrorDescription)
        : 'Google sign-in could not be completed. Please try again.';
      setError(detail);
      return;
    }

    setError('');
  }, [queryError, queryErrorDescription]);

  useEffect(() => {
    api.getPublicGrowth<ApiPublicGrowth>()
      .then(setPublicGrowth)
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const normalizedEmail = email.trim();
    try {
      if (isSignup) {
        if (!fullName.trim()) { setError('Please enter your full name.'); setLoading(false); return; }
        if (!acceptedLegal) { setError('You must accept the Privacy Policy and Terms & Conditions to create an account.'); setLoading(false); return; }
        if (!awaitingVerification) {
          const result = await api.requestSignupCode(normalizedEmail);
          setAwaitingVerification(true);
          setVerificationCode('');
          setVerificationMessage(result.message || 'Verification code sent. Enter it below to complete your signup.');
          setLoading(false);
          return;
        }
        if (!verificationCode.trim()) { setError('Please enter the verification code sent to your email.'); setLoading(false); return; }
        await signup(normalizedEmail, password, fullName, verificationCode.trim());
      } else {
        await login(normalizedEmail, password);
      }
    } catch (err) {
      const authError = err as Error & { code?: string };
      if (isSignup && authError.code === 'account_exists') {
        setIsSignup(false);
        setError(authError.message || 'This email is already registered. Please sign in instead.');
      } else if (!isSignup && authError.code === 'new_user') {
        setIsSignup(true);
        setError(authError.message || 'This looks like a new user. Create your account first.');
      } else {
        setError(authError instanceof Error ? authError.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const result = await api.requestSignupCode(email.trim());
      setVerificationMessage(result.message || 'Verification code sent again. Check your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification code could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const resetVerificationStep = () => {
    setAwaitingVerification(false);
    setVerificationCode('');
    setVerificationMessage('');
    setError('');
  };

  const handleGoogle = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 surface-primary">
        <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 surface-primary">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 fade-in">
          <Link href="/" className="mb-6 inline-flex">
            <BrandLogo size={40} priority nameClassName="text-2xl font-bold text-primary" />
          </Link>
          <h1 className="text-2xl font-bold text-primary">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-secondary mt-2">
            {isSignup
              ? 'Use Google for instant signup, or continue with email and password.'
              : 'Sign in with Google or email/password.'}
          </p>
          {!isSignup ? (
            <p className="text-xs text-tertiary mt-2">
              Secure login with low friction so you can get back to interview practice quickly.
            </p>
          ) : null}
          {isSignup ? (
            <LaunchOfferBanner
              className="mt-3"
              tone="light"
              maxSlots={publicGrowth?.launch_offer?.max_slots}
              remainingSlots={publicGrowth?.launch_offer?.remaining_slots}
              offerDurationDays={publicGrowth?.launch_offer?.offer_duration_days}
            />
          ) : null}
          {publicGrowth?.login_message ? (
            <div className="mt-4 rounded-2xl border border-blue-200/70 bg-blue-50/85 px-4 py-3 text-sm font-medium text-blue-800 shadow-[0_12px_36px_rgba(37,99,235,0.08)] dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              {publicGrowth.login_message}
            </div>
          ) : null}
        </div>

        {/* Card */}
        <div className="card p-6 slide-up">
          {/* Google Sign-In */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-border px-4 py-3 font-medium text-primary transition-colors hover:bg-hover disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <p className="mt-3 text-center text-xs text-secondary">
            Google login works for both new and existing PrepVista users.
          </p>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-3 surface-primary text-secondary">or</span></div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-primary mb-1.5">Full name</label>
                <input id="fullName" type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  className="input" placeholder="Your full name" required disabled={awaitingVerification} />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-primary mb-1.5">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@example.com" required disabled={awaitingVerification} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-primary mb-1.5">Password</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="At least 6 characters" required minLength={6} disabled={awaitingVerification} />
            </div>

            {isSignup && awaitingVerification && (
              <div className="space-y-3 rounded-2xl border border-blue-200/60 bg-blue-50/70 px-4 py-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div>
                  <label htmlFor="verificationCode" className="block text-sm font-medium text-primary mb-1.5">Verification code</label>
                  <input
                    id="verificationCode"
                    type="text"
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input"
                    placeholder="Enter 6-digit code"
                    required
                    maxLength={6}
                  />
                </div>
                <p className="text-sm text-secondary">
                  {verificationMessage || 'We sent a 6-digit verification code to your email. Enter it here to finish creating your account.'}
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <button type="button" onClick={() => void handleResendCode()} className="text-brand font-medium hover:underline">
                    Resend code
                  </button>
                  <button type="button" onClick={resetVerificationStep} className="text-secondary hover:underline">
                    Use different email
                  </button>
                </div>
              </div>
            )}

            {isSignup && (
              <label className="flex items-start gap-3 rounded-2xl border border-border px-4 py-3 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={event => setAcceptedLegal(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border bg-transparent text-blue-500"
                  required
                  disabled={awaitingVerification}
                />
                <span>
                  I accept the{' '}
                  <Link href="/privacy" className="text-brand hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/terms" className="text-brand hover:underline">
                    Terms & Conditions
                  </Link>
                  . This is mandatory for account creation.
                </span>
              </label>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
            )}

            {isSignup && !awaitingVerification && (
              <div className="rounded-2xl border border-blue-200/60 bg-blue-50/70 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
                We enable verification code for your account safety.
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isSignup ? (awaitingVerification ? 'Verifying code...' : 'Sending code...') : 'Signing in...'}
                </span>
              ) : (
                isSignup ? (awaitingVerification ? 'Verify code & create account' : 'Send verification code') : 'Sign in'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-secondary mt-6">
            {isSignup ? (
              <>Already have an account?{' '}<button onClick={() => { setIsSignup(false); setError(''); setAwaitingVerification(false); setVerificationCode(''); setVerificationMessage(''); }} className="text-brand font-medium hover:underline">Sign in</button></>
            ) : (
              <>Don&apos;t have an account?{' '}<button onClick={() => { setIsSignup(true); setError(''); setAwaitingVerification(false); setVerificationCode(''); setVerificationMessage(''); }} className="text-brand font-medium hover:underline">Create one with email</button></>
            )}
          </p>
        </div>

        <p className="text-center text-xs text-tertiary mt-6">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="hover:underline">Terms</Link>{' '}and{' '}
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
