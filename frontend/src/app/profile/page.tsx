'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { CreditCardIcon, CrownIcon, FileIcon, PaletteIcon, TrashIcon, UserIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getStartInterviewHref } from '@/lib/plan-usage';

interface BillingData {
  active_plan: string;
  owned_plans: string[];
  expired_plans: string[];
  highest_owned_plan: string;
  subscription_status: string;
  recent_payments: Array<{
    plan: string;
    amount: string;
    status: string;
    created_at: string;
    verified_at?: string | null;
  }>;
}

function formatPlanName(plan: string) {
  return plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : 'Free';
}

function formatBillingDateTime(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const router = useRouter();
  const startInterviewHref = getStartInterviewHref(user?.usage);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.getBillingStatus<BillingData>()
      .then(setBillingData)
      .catch(error => {
        setActionNotice(error instanceof Error ? error.message : 'Billing details could not be loaded right now.');
      })
      .finally(() => setLoading(false));
  }, [authLoading, router, user]);

  const ownedPlans = billingData?.owned_plans || user?.owned_plans || ['free'];
  const expiredPlans = billingData?.expired_plans || user?.expired_plans || [];
  const activePlan = billingData?.active_plan || user?.active_plan || user?.plan || 'free';
  const highestOwnedPlan = billingData?.highest_owned_plan || user?.highest_owned_plan || 'free';
  const canDeleteAccount = Boolean(user && !user.is_admin && !user.premium_override);
  const planCards: Array<'free' | 'pro' | 'career'> = ['free', 'pro', 'career'];

  const handleDeleteAccount = async () => {
    if (!canDeleteAccount || deletingAccount) {
      return;
    }

    const confirmed = window.confirm(
      'Delete Account will permanently remove your PrepVista profile, interview sessions, reports, and related data. This cannot be undone. Do you want to continue?',
    );
    if (!confirmed) {
      return;
    }

    setDeletingAccount(true);
    setActionNotice('');
    try {
      await api.deleteAccount();
      logout();
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Account deletion failed. Please try again.');
      setDeletingAccount(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader backHref="/dashboard" backLabel="Back to main" />

      <div className="mx-auto max-w-5xl px-6 py-8">
        {actionNotice ? (
          <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
            actionNotice.toLowerCase().includes('failed') || actionNotice.toLowerCase().includes('could not')
              ? 'border border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300'
              : 'border border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300'
          }`}>
            {actionNotice}
          </div>
        ) : null}

        <div className="mb-8 fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <UserIcon size={14} />
            Profile
          </div>
          <h1 className="text-3xl font-bold text-primary">Profile</h1>
          <p className="mt-2 text-secondary">
            Account, access, and billing details are managed here.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="card p-6 slide-up">
            <div className="mb-5 flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <UserIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Account details</h2>
                <p className="text-sm text-secondary">Profile details currently connected to your PrepVista account.</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-secondary">Full name</span>
                <span className="font-medium text-primary sm:text-right">{user.full_name || 'Not added yet'}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-secondary">Email</span>
                <span className="break-all font-medium text-primary sm:text-right">{user.email}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-secondary">Selected interview mode</span>
                <span className="font-medium text-primary sm:text-right">{formatPlanName(activePlan)}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-secondary">Highest active tier</span>
                <span className="font-medium text-primary sm:text-right">{formatPlanName(highestOwnedPlan)}</span>
              </div>
              <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-secondary">Workspace mode</span>
                <span className="font-medium text-primary sm:text-right">Dark only</span>
              </div>
            </div>
          </section>

          <section className="card p-6 slide-up">
            <div className="mb-5 flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <CrownIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Plans and access</h2>
                <p className="text-sm text-secondary">View your Free, Pro, and Career access state and manage billing actions.</p>
              </div>
            </div>

            <div className="space-y-3">
              {planCards.map(plan => {
                const isOwned = ownedPlans.includes(plan);
                const isExpired = expiredPlans.includes(plan);
                const isActive = plan === activePlan && isOwned;
                const isFree = plan === 'free';
                const statusLabel = isActive ? 'ACTIVE' : isExpired ? 'EXPIRED' : (isOwned || isFree) ? 'AVAILABLE' : 'LOCKED';
                const helperText = isActive
                  ? 'Currently selected and active'
                  : isExpired
                    ? 'Expired. Renew this plan to restore premium access.'
                    : (isOwned || isFree)
                      ? (isFree ? 'Always available base plan' : 'Available and switchable from main workspace')
                      : 'Locked. Upgrade from pricing to unlock';

                return (
                <div key={plan} className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                  isExpired
                    ? 'border-amber-200/80 bg-amber-50/80 dark:border-amber-900/30 dark:bg-amber-900/15'
                    : 'border-border'
                }`}>
                  <div>
                    <div className="font-medium text-primary">{formatPlanName(plan)}</div>
                    <div className="text-xs text-secondary">{helperText}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : isExpired
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : statusLabel === 'LOCKED'
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  }`}>
                    {statusLabel}
                  </div>
                </div>
                );
              })}
            </div>

            <div className="mt-5 flex gap-3">
              <Link href="/dashboard" className="btn-primary flex-1 justify-center">
                Manage in main
              </Link>
              <Link href="/pricing" className="btn-secondary flex-1 justify-center">
                View pricing
              </Link>
            </div>

          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="card p-6 slide-up">
            <div className="mb-5 flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <CreditCardIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Recent billing</h2>
                <p className="text-sm text-secondary">Latest verified and pending plan transactions appear here.</p>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(item => (
                  <div key={item} className="h-16 rounded-2xl bg-slate-100 animate-pulse dark:bg-slate-800" />
                ))}
              </div>
            ) : billingData?.recent_payments?.length ? (
              <div className="space-y-3">
                {billingData.recent_payments.map((payment, index) => (
                  <div key={`${payment.plan}-${index}`} className="rounded-2xl border border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-primary">{formatPlanName(payment.plan)} plan</div>
                        <div className="mt-1 text-xs text-secondary">
                          {payment.amount}
                        </div>
                        <div className="mt-1 text-xs text-secondary">
                          Purchased: {formatBillingDateTime(payment.verified_at || payment.created_at) || 'Unavailable'}
                        </div>
                        <div className="text-xs text-tertiary">
                          Order created: {formatBillingDateTime(payment.created_at) || 'Unavailable'}
                        </div>
                      </div>
                      <div className="rounded-full bg-hover px-3 py-1 text-xs font-semibold text-secondary uppercase">
                        {payment.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-secondary">No recent plan payments yet.</p>
            )}
          </section>

          <section className="card p-6 slide-up">
            <div className="mb-5 flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <PaletteIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Useful shortcuts</h2>
                <p className="text-sm text-secondary">Quick links for common account and interview actions.</p>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/settings" className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 transition-colors hover:border-blue-400">
                <div>
                  <div className="font-medium text-primary">Appearance settings</div>
                  <div className="text-xs text-secondary">View the dark-only workspace appearance setup.</div>
                </div>
                <PaletteIcon size={18} className="text-secondary" />
              </Link>
              <Link href="/history" className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 transition-colors hover:border-blue-400">
                <div>
                  <div className="font-medium text-primary">Interview history</div>
                  <div className="text-xs text-secondary">Open the dedicated page for all session history.</div>
                </div>
                <FileIcon size={18} className="text-secondary" />
              </Link>
              <Link href={startInterviewHref} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 transition-colors hover:border-blue-400">
                <div>
                  <div className="font-medium text-primary">{startInterviewHref === '/pricing' ? 'Restore interview access' : 'Start next interview'}</div>
                  <div className="text-xs text-secondary">
                    {startInterviewHref === '/pricing'
                      ? 'Your selected plan is out of interviews, so this opens pricing.'
                      : 'Launch a new interview using your active selected plan.'}
                  </div>
                </div>
                <CrownIcon size={18} className="text-secondary" />
              </Link>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-hover/40 px-4 py-3">
              <div className="text-sm font-medium text-primary">Need help?</div>
              <p className="mt-1 text-xs text-secondary">
                If you have any query, send mail to{' '}
                <a
                  href="mailto:support.prepvistaai@gmail.com"
                  className="font-medium text-blue-600 hover:underline dark:text-blue-300"
                >
                  support.prepvistaai@gmail.com
                </a>
                .
              </p>
            </div>
          </section>
        </div>

        {canDeleteAccount ? (
          <section className="mt-6 card border-rose-200/80 bg-rose-50/70 p-6 slide-up dark:border-rose-900/30 dark:bg-rose-900/10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  <TrashIcon size={14} />
                  Permanent action
                </div>
                <h2 className="text-lg font-semibold text-primary">Delete Account</h2>
                <p className="mt-2 max-w-2xl text-sm text-secondary">
                  This permanently deletes your profile, interview sessions, reports, and related account data from the active database. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={deletingAccount}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-white px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                <TrashIcon size={15} />
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
