'use client';
/**
 * PrepVista - Pricing Page
 * Supports purchase, expiry awareness, and switching across active tiers.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { BrandLogo } from '@/components/brand-logo';
import { ArrowLeftIcon, CrownIcon } from '@/components/icons';
import { LaunchOfferBanner } from '@/components/launch-offer-banner';
import { useAuth } from '@/lib/auth-context';
import { api, ApiPublicGrowth } from '@/lib/api';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type PlanCard = {
  id: 'free' | 'pro' | 'career';
  name: string;
  price: string;
  period: string;
  desc: string;
  highlight: boolean;
  badge?: string;
  features: readonly string[];
};

const plans: readonly PlanCard[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'Rs 0',
    period: '/month',
    desc: '2 interviews per month',
    highlight: false,
    features: [
      '2 interviews per month',
      'Resume-based interview questions',
      'In-app feedback after each session',
      'No session history',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Rs 299',
    period: '/month',
    desc: '15 interviews per month',
    highlight: true,
    badge: 'Most Popular',
    features: [
      '15 interviews per month',
      'Detailed coaching and evaluation',
      'Downloadable PDF reports',
      'Session history and progress access',
    ],
  },
  {
    id: 'career',
    name: 'Career',
    price: 'Rs 699',
    period: '/month',
    desc: 'Unlimited interviews for one month',
    highlight: false,
    features: [
      'Unlimited interviews for one month',
      'Everything in Pro',
      'Advanced interview depth',
      'Career-level interview simulation',
      'Best product behavior',
    ],
  },
];

export default function PricingPage() {
  const { user, loading: authLoading, refreshUser, applyOptimisticPlan } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [publicGrowth, setPublicGrowth] = useState<ApiPublicGrowth | null>(null);
  const hasTrackedViewRef = useRef(false);

  const ownedPlans = new Set(user?.owned_plans || ['free']);
  const expiredPlans = new Set(user?.expired_plans || []);

  useEffect(() => {
    if (authLoading || hasTrackedViewRef.current) {
      return;
    }
    hasTrackedViewRef.current = true;
    void api.trackEvent('pricing page viewed', {
      page: 'pricing',
      user_state: user ? 'logged_in' : 'visitor',
    });
  }, [authLoading, user]);

  // Redirect org_student users away from pricing — their college manages access
  useEffect(() => {
    if (!authLoading && user?.org_student) {
      router.replace('/student-dashboard');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    api.getPublicGrowth<ApiPublicGrowth>()
      .then(setPublicGrowth)
      .catch(() => undefined);
  }, []);

  // Block render synchronously for org_student — no pricing flash
  if (!authLoading && user?.org_student) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  const handleSwitch = async (planId: string) => {
    const previousPlan = user?.active_plan || user?.plan || 'free';
    setLoading(planId);
    setError('');
    applyOptimisticPlan(planId);
    try {
      await api.switchPlan(planId);
      await refreshUser();
    } catch (err) {
      applyOptimisticPlan(previousPlan);
      setError(err instanceof Error ? err.message : 'Failed to switch plan.');
    } finally {
      setLoading(null);
    }
  };

  const handleCheckout = async (planId: string) => {
    if (planId !== 'free') {
      void api.trackEvent('upgrade clicked', {
        plan: planId,
        source: 'pricing_page',
        user_state: user ? 'logged_in' : 'visitor',
      });
    }

    if (loading) {
      return;
    }
    if (!user) {
      window.location.href = '/login?mode=signup';
      return;
    }
    if (planId === 'free') {
      await handleSwitch('free');
      return;
    }

    if (ownedPlans.has(planId)) {
      await handleSwitch(planId);
      return;
    }

    setError('');
    setLoading(planId);

    try {
      const order = await api.createOrder<{
        order_id: string;
        amount: number;
        currency: string;
        key_id: string;
        prefill: { email: string };
      }>(planId);

      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load payment gateway.'));
          document.head.appendChild(script);
        });
      }

      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'PrepVista',
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        order_id: order.order_id,
        prefill: { email: order.prefill.email },
        theme: { color: '#2563eb' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.verifyPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
            await refreshUser();
            window.location.href = '/dashboard?payment=success';
          } catch {
            setError('Payment verification failed. If charged, please contact support.');
          } finally {
            setLoading(null);
          }
        },
        modal: {
          ondismiss: () => setLoading(null),
        },
      });

      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout.');
      setLoading(null);
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(user ? '/interview/setup' : '/');
  };

  return (
    <div className="min-h-screen surface-primary">
      <nav className="border-b border-border px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href={user ? '/dashboard' : '/'} className="inline-flex">
            <BrandLogo size={36} priority nameClassName="text-lg font-bold text-primary" />
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link href="/dashboard" className="text-sm text-secondary hover:text-brand">Main</Link>
                <Link href="/profile" className="text-sm text-secondary hover:text-brand">Profile</Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-secondary hover:text-brand">Log in</Link>
                <Link href="/login?mode=signup" className="btn-primary text-sm !px-5 !py-2">Start Free</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto mb-12 max-w-3xl text-center fade-in">
          <div className="mb-5 flex justify-center">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:-translate-y-0.5 hover:border-blue-400 hover:text-brand"
            >
              <ArrowLeftIcon size={16} />
              {user ? 'Back to interview setup' : 'Back to home'}
            </button>
          </div>
          <h1 className="text-4xl font-bold text-primary">Choose or switch your plan</h1>
          <p className="mt-4 text-lg text-secondary">
            Paid plans stay active for one month from the exact verified purchase time. If a plan expires, renew it to use that tier again.
          </p>
          <LaunchOfferBanner
            className="mt-3"
            tone="light"
            maxSlots={publicGrowth?.launch_offer?.max_slots}
            remainingSlots={publicGrowth?.launch_offer?.remaining_slots}
            offerDurationDays={publicGrowth?.launch_offer?.offer_duration_days}
          />
        </div>

        {error ? (
          <div className="mx-auto mb-8 max-w-lg rounded-xl bg-red-50 p-4 text-center text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-3 slide-up">
          {plans.map(plan => {
            const isOwned = ownedPlans.has(plan.id);
            const isExpired = expiredPlans.has(plan.id);
            const isActive = user?.active_plan === plan.id;

            return (
              <div
                key={plan.id}
                className={`card relative flex flex-col p-6 ${plan.highlight ? 'border-blue-500 ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/10' : ''}`}
              >
                {plan.badge ? (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                    {plan.badge}
                  </div>
                ) : null}

                <div className="mb-6 pt-3 text-center">
                  <h3 className="text-lg font-semibold text-primary">{plan.name}</h3>
                  <p className="mt-2 text-sm text-secondary">{plan.desc}</p>
                  <div className="mt-4 flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-primary">{plan.price}</span>
                    <span className="text-sm text-secondary">{plan.period}</span>
                  </div>
                </div>

                <ul className="mb-6 flex-1 space-y-3">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-green-500">
                        <CrownIcon size={14} />
                      </span>
                      <span className="text-primary">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mb-4 rounded-full bg-hover px-3 py-1 text-center text-xs font-semibold text-secondary">
                  {isActive ? 'Current selected plan' : isOwned ? 'Currently active' : isExpired ? `${plan.name} expired` : 'Not purchased yet'}
                </div>

                <button
                  type="button"
                  onClick={() => handleCheckout(plan.id)}
                  disabled={loading !== null || isActive}
                  className={`${plan.highlight ? 'btn-primary' : 'btn-secondary'} w-full !py-3`}
                >
                  {loading === plan.id
                    ? 'Processing...'
                    : isActive
                      ? 'Current Selection'
                      : isOwned
                        ? `Switch to ${plan.name}`
                        : isExpired
                          ? `Renew ${plan.name}`
                        : plan.id === 'free'
                          ? 'Use Free'
                          : `Buy ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
