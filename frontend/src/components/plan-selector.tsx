'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/lib/auth-context';
import { api, ApiUser } from '@/lib/api';

import {
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  CrownIcon,
  LockIcon,
  SparklesIcon,
} from './icons';

const planOptions = [
  {
    id: 'free',
    name: 'Free',
    short: '2 interviews per month',
    description: 'Resume-based interview questions',
    icon: CrownIcon,
  },
  {
    id: 'pro',
    name: 'Pro',
    short: '15 interviews per month',
    description: 'Detailed coaching and evaluation',
    icon: SparklesIcon,
  },
  {
    id: 'career',
    name: 'Career',
    short: 'Unlimited interviews for one month',
    description: 'Career-level interview simulation',
    icon: BoltIcon,
  },
] as const;

export function PlanSelector({
  user,
  placement = 'bottom',
  onSelectedPlanChange,
}: {
  user: ApiUser;
  placement?: 'top' | 'bottom';
  onSelectedPlanChange?: (plan: string) => void;
}) {
  const { refreshUser, applyOptimisticPlan } = useAuth();
  const [open, setOpen] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activePlan = user.active_plan || user.plan || 'free';
  const ownedPlans = new Set(user.owned_plans || ['free']);
  const expiredPlans = new Set(user.expired_plans || []);
  const currentOption = planOptions.find(option => option.id === activePlan) || planOptions[0];
  const dropdownPlacementClass = placement === 'top' ? 'bottom-[calc(100%+12px)]' : 'top-[calc(100%+12px)]';

  // Org students (college-granted) get a fixed Career badge — no switching allowed
  if (user.org_student) {
    return (
      <div className="inline-flex items-center gap-2.5 rounded-full border px-4 py-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
        <BoltIcon size={16} className="text-blue-500" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-primary">Career</span>
          <span className="block text-xs text-secondary">College granted access</span>
        </span>
      </div>
    );
  }

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSwitch = async (plan: string) => {
    if (loadingPlan || plan === activePlan || !ownedPlans.has(plan)) {
      return;
    }

    const previousPlan = activePlan;
    setLoadingPlan(plan);
    setOpen(false);
    setMessage('');
    applyOptimisticPlan(plan);
    onSelectedPlanChange?.(plan);
    try {
      const result = await api.switchPlan<{ message: string }>(plan);
      await refreshUser();
      setMessage(result.message || `${plan.toUpperCase()} is now selected.`);
    } catch (error) {
      applyOptimisticPlan(previousPlan);
      onSelectedPlanChange?.(previousPlan);
      setMessage(error instanceof Error ? error.message : 'Failed to switch plan.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div ref={containerRef} className="relative z-[80]">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex min-w-[184px] items-center justify-between gap-3 rounded-full border px-4 py-3 text-left shadow-[0_16px_36px_rgba(2,8,23,0.08)] dark:shadow-[0_16px_36px_rgba(2,8,23,0.32)] backdrop-blur-xl transition-all hover:border-sky-400/60"
        style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-primary">{currentOption.name}</span>
          <span className="block truncate text-xs text-secondary">{currentOption.short}</span>
        </span>
        <ChevronDownIcon size={16} className={`shrink-0 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className={`absolute right-0 z-[90] w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border p-3 shadow-[0_28px_64px_rgba(2,8,23,0.18)] dark:shadow-[0_28px_64px_rgba(2,8,23,0.68)] ${dropdownPlacementClass}`} style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="max-h-[min(24rem,calc(100vh-8rem))] space-y-1 overflow-y-auto pr-1">
            {planOptions.map(option => {
              const Icon = option.icon;
              const owned = ownedPlans.has(option.id);
              const expired = expiredPlans.has(option.id);
              const active = option.id === activePlan;

              if (!owned) {
                return (
                  <Link
                    key={option.id}
                    href="/pricing"
                    className="flex items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors hover:bg-hover"
                  >
                    <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-secondary" style={{ background: 'var(--bg-hover)' }}>
                      <LockIcon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-primary">{option.name}</span>
                      <span className="mt-0.5 block text-sm text-secondary">{option.short}</span>
                      <span className="mt-0.5 block text-sm text-tertiary">
                        {expired ? 'This plan expired. Renew it to restore access.' : option.description}
                      </span>
                    </span>
                    <span className={`mt-1 text-xs font-semibold uppercase tracking-[0.16em] ${expired ? 'text-amber-500 dark:text-amber-300' : 'text-tertiary'}`}>
                      {expired ? 'Expired' : 'Locked'}
                    </span>
                  </Link>
                );
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void handleSwitch(option.id)}
                  disabled={loadingPlan !== null || active}
                  className={`flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors ${
                    active ? 'bg-sky-500/12 ring-1 ring-sky-400/28' : 'hover:bg-hover'
                  }`}
                >
                  <span className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                    active ? 'bg-sky-500/18 text-sky-600 dark:text-sky-100' : 'text-secondary'
                  }`} style={active ? undefined : { background: 'var(--bg-hover)' }}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-primary">{option.name}</span>
                    <span className="mt-0.5 block text-sm text-secondary">{option.short}</span>
                    <span className="mt-0.5 block text-sm text-tertiary">{option.description}</span>
                  </span>
                  <span className="mt-1 inline-flex h-6 min-w-6 items-center justify-center">
                    {active ? <CheckIcon size={16} className="text-primary" /> : loadingPlan === option.id ? <span className="text-xs text-tertiary">...</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-secondary">{message}</p> : null}
    </div>
  );
}
