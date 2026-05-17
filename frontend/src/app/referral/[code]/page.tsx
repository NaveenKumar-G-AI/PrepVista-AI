'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { BrandLogo } from '@/components/brand-logo';
import { GiftIcon, SparklesIcon } from '@/components/icons';
import { api, ApiPublicReferral } from '@/lib/api';

export default function ReferralInvitePage() {
  const params = useParams<{ code: string }>();
  const referralCode = useMemo(() => {
    const rawCode = params?.code;
    return Array.isArray(rawCode) ? rawCode[0] : rawCode || '';
  }, [params]);

  const [data, setData] = useState<ApiPublicReferral | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!referralCode) {
      setLoading(false);
      setData({ valid: false, message: 'This referral link is invalid or unavailable.' });
      return;
    }

    const loadReferral = async () => {
      try {
        const response = await api.getPublicReferral(referralCode);
        setData(response);
      } catch (error) {
        setData({
          valid: false,
          message: error instanceof Error ? error.message : 'This referral link is invalid or unavailable.',
        });
      } finally {
        setLoading(false);
      }
    };

    void loadReferral();
  }, [referralCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !data?.valid || submitting) {
      return;
    }

    setSubmitting(true);
    setMessage('');
    setStatus('');
    try {
      const result = await api.queueReferral(referralCode, email.trim());
      setMessage(result.message);
      setStatus(result.status);
      if (result.status === 'queued') {
        setEmail('');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Referral could not be queued right now.');
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  const isUnlimitedReferral = Boolean(data?.is_unlimited);
  const noSlotsLeft = Boolean(data?.valid && !isUnlimitedReferral && (data?.remaining_slots ?? 0) <= 0);
  const remainingSlots = data?.remaining_slots ?? 0;
  const referrerName = data?.referrer_name || 'A PrepVista user';

  return (
    <div className="min-h-screen bg-[#050b1a] px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex">
            <BrandLogo
              size={40}
              priority
              className="flex items-center gap-3"
              imageClassName="rounded-2xl object-contain shadow-[0_0_30px_rgba(59,130,246,0.35)]"
              nameClassName="text-lg font-semibold text-white"
              subtitle="AI interview coaching"
              subtitleClassName="text-xs text-white/45"
            />
          </Link>
          <Link href="/login?mode=signup" className="rounded-xl border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10">
            Create account
          </Link>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_12%_12%,rgba(56,189,248,0.22),transparent_28%),linear-gradient(135deg,#07111f_0%,#0c1830_48%,#0f1b31_100%)] p-7 shadow-[0_30px_80px_rgba(2,8,23,0.34)]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
            <GiftIcon size={14} />
            Referral invite
          </div>

          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200/30 border-t-blue-400" />
            </div>
          ) : !data?.valid ? (
            <div className="space-y-5">
              <h1 className="text-3xl font-bold tracking-[-0.03em]">This referral link is not available.</h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300">
                {data?.message || 'The referral code could not be resolved. You can still create your account directly and start practicing.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login?mode=signup" className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold shadow-[0_14px_40px_rgba(59,130,246,0.35)]">
                  Create account
                </Link>
                <Link href="/" className="rounded-2xl border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/90">
                  Back home
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="text-sm font-medium text-slate-300">PrepVista invite</div>
                <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em]">
                  {referrerName} invited you to PrepVista.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                  Enter your email to queue this referral. If this email does not already exist in PrepVista, the invite stays reserved for this exact email only, uses one referral slot, and gives the referrer exactly 1 extra interview when this email joins.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="referral-email" className="mb-1.5 block text-sm font-medium text-white/90">
                      Email address
                    </label>
                    <input
                      id="referral-email"
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
                      required
                      disabled={submitting || noSlotsLeft}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || noSlotsLeft}
                    className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold shadow-[0_14px_40px_rgba(59,130,246,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Queueing referral...' : 'Queue referral'}
                  </button>

                  {message ? (
                    <div className={`rounded-2xl px-4 py-3 text-sm ${
                      status === 'queued'
                        ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                        : status === 'exists'
                          ? 'border border-amber-400/20 bg-amber-500/10 text-amber-200'
                          : 'border border-white/12 bg-white/[0.05] text-slate-200'
                    }`}>
                      {message}
                    </div>
                  ) : null}

                  <p className="text-sm text-slate-400">
                    Use the same email when you create your PrepVista account. This exact email can complete the referral only once.
                  </p>
                </form>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200">
                    <SparklesIcon size={13} />
                    Invite state
                  </div>
                  <div className="mt-3 text-3xl font-bold text-white">{isUnlimitedReferral ? 'Unlimited' : remainingSlots}</div>
                  <div className="mt-1 text-sm text-slate-300">
                    {isUnlimitedReferral
                      ? 'unlimited referral slots are available on this invite'
                      : `referral slot${remainingSlots === 1 ? '' : 's'} still available on this link`}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-sm font-semibold text-white">How it works</div>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                    <div>1. Submit an email that does not already exist in PrepVista.</div>
                    <div>2. The referral stays queued for that exact email address and uses one slot.</div>
                    <div>3. When that email joins PrepVista, the referrer receives exactly 1 extra interview.</div>
                    <div>4. The new user also gets their own 3 referral invites after joining.</div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-sm font-semibold text-white">Join now</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    If you are ready, create your account now with the same email to complete the referral path cleanly.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/login?mode=signup" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">
                      Create account
                    </Link>
                    <Link href="/login" className="rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white">
                      Existing user login
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
