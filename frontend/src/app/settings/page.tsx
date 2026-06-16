'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { CreditCardIcon, PaletteIcon, SettingsIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface BillingData {
  active_plan: string;
  owned_plans: string[];
  recent_payments: Array<{
    plan: string;
    amount: string;
    status: string;
    created_at: string;
    verified_at?: string | null;
  }>;
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

export default function SettingsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const router = useRouter();

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.getBillingStatus<BillingData>().then(setBillingData).catch(() => undefined);
  }, [authLoading, router, user]);

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

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <SettingsIcon size={14} />
            Settings
          </div>
          <h1 className="text-3xl font-bold text-primary">Settings</h1>
          <p className="mt-2 text-secondary">Dark-mode workspace controls, account access, and payment visibility stay organized here.</p>
        </div>

        <section className="card mb-6 p-6 slide-up">
          <div className="mb-5 flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <PaletteIcon size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">Appearance</h2>
              <p className="text-sm text-secondary">PrepVista now runs in one consistent dark workspace across all pages.</p>
            </div>
          </div>

          <div className="dark-notice-panel px-4 py-4">
            <div className="dark-notice-title text-sm font-semibold">Dark mode active</div>
            <div className="dark-notice-body mt-1 text-sm">
              Light and system theme switching have been removed so the full product keeps one premium dark experience.
            </div>
          </div>
        </section>

        <section className="card mb-6 p-6 slide-up">
          <div className="mb-5 flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <CreditCardIcon size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">Billing snapshot</h2>
              <p className="text-sm text-secondary">Quick account-level payment visibility without leaving settings.</p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-3 text-sm text-secondary">
            <span>Selected plan: <strong className="text-primary">{billingData?.active_plan?.toUpperCase() || user.active_plan.toUpperCase()}</strong></span>
            <span>Owned plans: <strong className="text-primary">{(billingData?.owned_plans || user.owned_plans).map(plan => plan.toUpperCase()).join(', ')}</strong></span>
          </div>

          {billingData?.recent_payments?.length ? (
            <div className="space-y-3">
              {billingData.recent_payments.map((payment, index) => (
                <div key={`${payment.plan}-${index}`} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium text-primary">{payment.plan.toUpperCase()} plan</div>
                    <div className="text-xs text-secondary">{payment.amount}</div>
                    <div className="mt-1 text-xs text-secondary">
                      Purchased: {formatBillingDateTime(payment.verified_at || payment.created_at) || 'Unavailable'}
                    </div>
                    <div className="text-xs text-tertiary">
                      Order created: {formatBillingDateTime(payment.created_at) || 'Unavailable'}
                    </div>
                  </div>
                  <div className="rounded-full bg-hover px-3 py-1 text-xs font-semibold uppercase text-secondary">
                    {payment.status}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-secondary">No payments recorded yet.</p>
          )}
        </section>

        <section className="card border-red-200 p-6 slide-up dark:border-red-900/40">
          <div className="mb-4 rounded-2xl border border-border bg-hover/40 px-4 py-3">
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
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Sign out</h2>
          <p className="mt-2 text-sm text-secondary">Sign out safely from this device.</p>
          <button
            type="button"
            onClick={logout}
            className="mt-4 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Sign Out
          </button>
        </section>
      </div>
    </div>
  );
}

