'use client';
/**
 * PrepVista - Main Workspace Page
 * Cleaner main page with hero, compact plan control, usage, and side navigation.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { BoltIcon, GiftIcon, HistoryIcon, PlayIcon, ShareIcon, SparklesIcon, TargetIcon } from '@/components/icons';
import { MainSideRail } from '@/components/main-side-rail';
import { PlanSelector } from '@/components/plan-selector';
import { api, ApiLaunchOfferState, ApiReferralSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getLowLimitNotice, getStartInterviewHref, isUnlimitedUsage, hasRemainingUsage, PlanUsage } from '@/lib/plan-usage';

interface DashboardData {
  user: {
    name: string | null;
    plan: string;
    active_plan: string;
    owned_plans: string[];
    expired_plans: string[];
    highest_owned_plan: string;
    plan_expiries?: {
      pro?: string | null;
      career?: string | null;
    };
    launch_offer?: ApiLaunchOfferState;
    onboarding_completed: boolean;
    prep_goal: string | null;
  };
  usage: PlanUsage;
  referrals: ApiReferralSummary;
  public_metrics?: {
    total_users_count: number;
    active_users_count: number;
    total_users_label: string;
    active_users_label: string;
    login_message: string;
    dashboard_message: string;
    launch_offer?: {
      max_slots: number;
      consumed_slots: number;
      remaining_slots: number;
      offer_duration_days: number;
      is_offer_available: boolean;
    };
    updated_at?: string | null;
  };
  recent_sessions?: Array<{
    id: string;
    plan: string;
    final_score: number;
    state: string;
    total_turns: number;
    duration: number | null;
    created_at: string;
    finished_at?: string | null;
  }>;
  current_feedback_session_id?: string | null;
}

function formatPlanName(plan: string) {
  return plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : 'Free';
}

function getCycleResetDateLabel(periodStart?: string | null) {
  const resetDate = periodStart ? new Date(periodStart) : new Date();
  if (Number.isNaN(resetDate.getTime())) {
    return 'soon';
  }
  resetDate.setDate(resetDate.getDate() + 30);
  return resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function formatExpiryDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function formatDateTime(value?: string | null) {
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

function getPlanExpiryBadge(plan: 'pro' | 'career', ownedPlans: string[], expiredPlans: string[], planExpiries?: { pro?: string | null; career?: string | null }) {
  const formattedExpiry = formatExpiryDate(planExpiries?.[plan]);
  if (ownedPlans.includes(plan)) {
    return formattedExpiry ? `Expires ${formattedExpiry}` : 'Active';
  }
  if (expiredPlans.includes(plan)) {
    return formattedExpiry ? `Expired ${formattedExpiry}` : 'Expired';
  }
  return 'Available';
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const router = useRouter();

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.is_org_admin) {
      router.replace('/org-admin');
      return;
    }
    if (user.org_student) {
      router.replace('/student-dashboard');
      return;
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    // Only fetch once — the API cache handles freshness
    if (fetchedRef.current) return;
    if (!authLoading && !user) return; // Will be redirected

    fetchedRef.current = true;

    const fetchDashboard = async () => {
      try {
        const dashboardData = await api.getDashboard<DashboardData>();
        setData(dashboardData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load the main workspace.');
      }
    };

    void fetchDashboard();
  }, [authLoading, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedSession = sessionStorage.getItem('pv_interview_session');
      if (!storedSession) {
        setStoredSessionId(null);
        return;
      }

      const parsed = JSON.parse(storedSession) as { session_id?: string };
      setStoredSessionId(parsed.session_id || null);
    } catch {
      setStoredSessionId(null);
    }
  }, []);

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen surface-primary">
        {/* Skeleton header */}
        <div className="sticky top-0 z-40 border-b px-4 py-4 backdrop-blur-2xl" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <div className="skeleton-card h-12 w-48" />
            <div className="flex-1" />
            <div className="skeleton-card h-10 w-32" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 py-8">
          {/* Hero skeleton */}
          <div className="skeleton-card h-48 w-full mb-6" />
          {/* Cards row */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 mb-6">
            <div className="skeleton-card h-36" />
            <div className="skeleton-card h-36" />
            <div className="skeleton-card h-36" />
          </div>
          {/* Bottom row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="skeleton-card h-44" />
            <div className="skeleton-card h-44" />
          </div>
        </div>
      </div>
    );
  }

  const workspaceUser = data?.user;
  const usage = data?.usage || user?.usage;
  const activePlan = workspaceUser?.active_plan || user?.active_plan || user?.plan || 'free';
  const ownedPlans = workspaceUser?.owned_plans || user?.owned_plans || ['free'];
  const expiredPlans = workspaceUser?.expired_plans || user?.expired_plans || [];
  const planExpiries = workspaceUser?.plan_expiries;
  const greetingName = (workspaceUser?.name || user?.full_name || 'there').split(' ')[0];
  const prepGoal = workspaceUser?.prep_goal;
  const unlimited = isUnlimitedUsage(usage) || (usage?.limit ?? 0) >= 9000;
  const usageUsed = usage?.used ?? 0;
  const usageLimit = usage?.limit ?? 0;
  const usageRemaining = usage?.remaining ?? 0;
  const usageProgress = unlimited ? 100 : Math.min(100, (usageUsed / Math.max(usageLimit, 1)) * 100);
  const startInterviewHref = getStartInterviewHref(usage);
  const liveSessionHref = storedSessionId ? `/interview/${storedSessionId}` : '/history';
  const careerHref = ownedPlans.includes('career') ? '/interview/setup' : '/pricing';
  const lowLimitNotice = getLowLimitNotice(usage);
  const referrals = data?.referrals;
  const publicMetrics = data?.public_metrics;
  const launchOffer = workspaceUser?.launch_offer;
  const hasSessionHistoryAccess = (workspaceUser?.highest_owned_plan || user?.effective_plan || 'free') !== 'free';
  const currentFeedbackSessionId =
    data?.current_feedback_session_id
    || data?.recent_sessions?.find(session => session.state === 'FINISHED')?.id
    || null;
  const currentFeedbackHref = currentFeedbackSessionId ? `/report/${currentFeedbackSessionId}` : null;
  const hasUnlimitedReferrals = Boolean(referrals?.is_unlimited);
  const showReferralSection = Boolean(referrals && (hasUnlimitedReferrals || (referrals.remaining_slots ?? 0) > 0));
  const referralBonus = usage?.referral_bonus_interviews ?? 0;
  const launchOfferDurationDays = launchOffer?.offer_duration_days ?? publicMetrics?.launch_offer?.offer_duration_days ?? 7;
  const launchOfferMaxSlots = launchOffer?.max_slots ?? publicMetrics?.launch_offer?.max_slots ?? 100;
  const launchOfferRemainingSlots = launchOffer?.remaining_slots ?? publicMetrics?.launch_offer?.remaining_slots ?? 0;
  const showPublicLaunchOfferStrip = launchOfferRemainingSlots > 0;
  const isLaunchOfferActive = launchOffer?.status === 'approved' && launchOffer?.plan === 'pro';
  const isLaunchOfferExpired = launchOffer?.status === 'expired' && launchOffer?.plan === 'pro';
  const launchOfferExpiryLabel = formatDateTime(launchOffer?.expires_at);

  const heroUsageText = unlimited
    ? Boolean(user?.is_admin || user?.premium_override)
      ? 'Unlimited admin interview access is active across Free, Pro, and Career.'
      : 'Unlimited interview access is active for your selected environment.'
    : `${usageRemaining} interview session${usageRemaining === 1 ? '' : 's'} remaining in your current environment.`;

  const handleCopyReferralLink = async () => {
    if (!referrals?.referral_url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(referrals.referral_url);
      setCopyStatus('Referral link copied.');
      window.setTimeout(() => setCopyStatus(''), 2200);
    } catch {
      setCopyStatus('Copy failed. Please copy the link manually.');
      window.setTimeout(() => setCopyStatus(''), 2800);
    }
  };

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
          <MainSideRail
            startInterviewHref={startInterviewHref}
            liveSessionHref={liveSessionHref}
            careerHref={careerHref}
            showAdminLink={Boolean(user?.is_admin || user?.premium_override)}
            showOrgAdminLink={Boolean(user?.is_org_admin)}
          />

          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.22),transparent_25%),radial-gradient(circle_at_85%_18%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(135deg,#07111f_0%,#0c1830_48%,#0f1b31_100%)] px-7 py-8 text-white shadow-[0_30px_80px_rgba(2,8,23,0.34)] fade-in md:px-8 md:py-10">
              <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <div className="absolute left-10 top-8 h-24 w-24 rounded-full bg-white/10 blur-3xl" />

              <div className="relative z-10 max-w-4xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                  <SparklesIcon size={14} />
                  Main workspace
                </div>
                <div className="text-sm font-medium text-slate-300">Welcome back, {greetingName}</div>
                <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
                  Your interview practice workspace is ready
                </h1>
                
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                  {heroUsageText} {prepGoal
                    ? `Current prep goal: ${prepGoal}. Keep momentum and run one focused session today.`
                    : 'Stay in motion with one focused session today, then use analytics to improve the next one.'}
                </p>

                {publicMetrics?.dashboard_message ? (
                  <div className="mt-5 max-w-3xl rounded-2xl border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-sky-100 shadow-[0_18px_40px_rgba(2,8,23,0.18)]">
                    {publicMetrics.dashboard_message}
                  </div>
                ) : null}

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href={startInterviewHref}
                    className="btn-primary !px-6 !py-3.5"
                    onClick={(e) => {
                      if (!hasRemainingUsage(usage)) {
                        e.preventDefault();
                        const plan = (activePlan || 'free').toLowerCase();
                        const upgradeTo = plan === 'career' ? 'Career' : plan === 'pro' ? 'Career' : 'Pro or Career';
                        alert(`Your quota is reached. If you want to use more, please buy ${upgradeTo} based on your current plan.`);
                        router.push('/pricing');
                      }
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PlayIcon size={16} />
                      {startInterviewHref === '/pricing' ? 'Open Billing' : 'Start Interview'}
                    </span>
                  </Link>
                  <Link href="/history" className="btn-secondary !px-6 !py-3.5">
                    <span className="inline-flex items-center gap-2">
                      <HistoryIcon size={16} />
                      Open Sessions
                    </span>
                  </Link>
                </div>

                <div className="mt-7 flex flex-wrap gap-3">
                  <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200">
                    Active plan: <span className="font-semibold text-white">{formatPlanName(activePlan)}</span>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200">
                    Pro: <span className="font-semibold text-white">{getPlanExpiryBadge('pro', ownedPlans, expiredPlans, planExpiries)}</span>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200">
                    Career: <span className="font-semibold text-white">{getPlanExpiryBadge('career', ownedPlans, expiredPlans, planExpiries)}</span>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200">
                    Reset: <span className="font-semibold text-white">{getCycleResetDateLabel(usage?.period_start)}</span>
                  </div>
                </div>
              </div>
            </section>

            {expiredPlans.length ? (
              <section className="rounded-[28px] border border-amber-200/70 bg-amber-50/90 px-6 py-5 text-amber-900 shadow-[0_18px_45px_rgba(120,53,15,0.08)] fade-in dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em]">Plan expired</div>
                    <div className="mt-1 text-base font-semibold">
                      Your {expiredPlans.map(plan => formatPlanName(plan)).join(' and ')} plan{expiredPlans.length > 1 ? 's have' : ' has'} expired.
                    </div>
                    <div className="mt-1 text-sm">
                      {activePlan === 'free'
                        ? 'You are currently back on Free. Please renew the expired plan to use its premium features again.'
                        : `Your current active workspace is ${formatPlanName(activePlan)}. Please renew the expired plan to use that tier again.`}
                    </div>
                  </div>
                  <Link href="/pricing" className="btn-secondary !border-amber-400/60 !bg-white/80 !text-amber-900 hover:!bg-white dark:!border-amber-700 dark:!bg-amber-950/30 dark:!text-amber-100 dark:hover:!bg-amber-950/50">
                    Renew plan
                  </Link>
                </div>
              </section>
            ) : null}

            {showPublicLaunchOfferStrip ? (
              <section className="rounded-[28px] border border-blue-200/70 bg-blue-50/90 px-6 py-5 text-blue-900 shadow-[0_18px_45px_rgba(37,99,235,0.08)] fade-in dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-200">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em]">Launch Offer</div>
                    <div className="text-base font-semibold">
                      First {launchOfferMaxSlots} users get free Pro access for {launchOfferDurationDays} days.
                    </div>
                    <div className="text-sm">Remaining spots: {launchOfferRemainingSlots}</div>
                  </div>
                  <Link href="/pricing" className="btn-secondary !border-blue-400/60 !bg-white/85 !text-blue-900 hover:!bg-white dark:!border-blue-700 dark:!bg-blue-950/30 dark:!text-blue-100 dark:hover:!bg-blue-950/50">
                    View plans
                  </Link>
                </div>
              </section>
            ) : null}

            {isLaunchOfferActive ? (
              <section className="rounded-[28px] border border-emerald-200/70 bg-emerald-50/90 px-6 py-5 text-emerald-900 shadow-[0_18px_45px_rgba(5,150,105,0.08)] fade-in dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em]">Free Pro Trial Active</div>
                    <div className="text-base font-semibold">
                      You have immediate Pro access for {launchOfferDurationDays} days.
                    </div>
                    <div className="text-sm">
                      {launchOfferExpiryLabel ? `Expires on ${launchOfferExpiryLabel}.` : 'Your trial is currently active.'}
                    </div>
                  </div>
                  <Link href="/interview/setup" className="btn-primary">
                    Start Pro Interview
                  </Link>
                </div>
              </section>
            ) : null}

            {isLaunchOfferExpired ? (
              <section className="rounded-[28px] border border-amber-200/70 bg-amber-50/90 px-6 py-5 text-amber-900 shadow-[0_18px_45px_rgba(120,53,15,0.08)] fade-in dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em]">Trial Expired</div>
                    <div className="mt-1 text-base font-semibold">
                      Your free Pro access expired. Purchase Pro or continue with Free.
                    </div>
                    <div className="mt-1 text-sm">
                      Pro features are now locked and your account is automatically back on Free.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href={startInterviewHref} className="btn-secondary !border-amber-400/60 !bg-white/85 !text-amber-900 hover:!bg-white dark:!border-amber-700 dark:!bg-amber-950/30 dark:!text-amber-100 dark:hover:!bg-amber-950/50">
                      Continue with Free
                    </Link>
                    <Link href="/pricing" className="btn-primary">
                      Purchase Pro
                    </Link>
                  </div>
                </div>
              </section>
            ) : null}

            {!hasSessionHistoryAccess ? (
              <section className="rounded-[28px] border border-emerald-200/70 bg-emerald-50/90 px-6 py-5 text-emerald-900 shadow-[0_18px_45px_rgba(5,150,105,0.08)] fade-in dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em]">Free Plan Session Access</div>
                    <div className="mt-1 text-base font-semibold">
                      Current session feedback stays visible. Past session history is locked on Free.
                    </div>
                    <div className="mt-1 text-sm">
                      Upgrade to Pro or Career to unlock full session history and revisit all past reports anytime.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {currentFeedbackHref ? (
                      <Link href={currentFeedbackHref} className="btn-secondary !border-emerald-400/60 !bg-white/85 !text-emerald-900 hover:!bg-white dark:!border-emerald-700 dark:!bg-emerald-950/30 dark:!text-emerald-100 dark:hover:!bg-emerald-950/50">
                        Open Current Feedback
                      </Link>
                    ) : (
                      <Link href={startInterviewHref} className="btn-secondary !border-emerald-400/60 !bg-white/85 !text-emerald-900 hover:!bg-white dark:!border-emerald-700 dark:!bg-emerald-950/30 dark:!text-emerald-100 dark:hover:!bg-emerald-950/50">
                        Start Interview
                      </Link>
                    )}
                    <Link href="/pricing" className="btn-primary">
                      Unlock Full History
                    </Link>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr] slide-up">
              <div className="card relative overflow-visible p-6">
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                      <TargetIcon size={14} />
                      Plan environment
                    </div>
                    <h2 className="text-2xl font-semibold text-primary">Choose how you want to practice today</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-secondary">
                      Select your current practice mode, review what is active, and move directly into your next interview.
                    </p>
                  </div>

                  {user ? <PlanSelector user={user} /> : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-hover px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Current selected mode</div>
                    <div className="mt-2 text-base font-semibold text-primary">{formatPlanName(activePlan)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-hover px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Unlocked plans</div>
                    <div className="mt-2 text-base font-semibold text-primary">{ownedPlans.map(plan => formatPlanName(plan)).join(', ')}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-hover px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Next step</div>
                    <div className="mt-2 text-base font-semibold text-primary">{startInterviewHref === '/pricing' ? 'Restore access' : 'Start a fresh interview'}</div>
                  </div>
                </div>
              </div>

              <div className="card relative overflow-hidden p-6">
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                      <BoltIcon size={14} />
                      Your current usage
                    </div>
                    <h2 className="text-2xl font-semibold text-primary">Usage headline</h2>
                    <p className="mt-2 text-sm leading-7 text-secondary">
                      {unlimited ? 'Unlimited interview access is active.' : `${usageRemaining} of ${usageLimit} sessions remaining this cycle.`}
                    </p>
                  </div>
                  <div className="rounded-full border border-border bg-hover px-3 py-1.5 text-xs font-medium text-secondary">
                    Resets on {getCycleResetDateLabel(usage?.period_start)}
                  </div>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-800/80">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${unlimited ? 'quota-progress-unlimited' : 'bg-[linear-gradient(90deg,#38bdf8,#3b82f6,#6366f1)]'}`}
                    style={{ width: `${usageProgress}%` }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-sm text-secondary">
                  <span>Used: <strong className="text-primary">{unlimited ? 'Unlimited' : usageUsed}</strong></span>
                  <span>Remaining: <strong className="text-primary">{unlimited ? 'Unlimited' : usageRemaining}</strong></span>
                  <span>Highest access: <strong className="text-primary">{formatPlanName(workspaceUser?.highest_owned_plan || user?.highest_owned_plan || user?.effective_plan || 'free')}</strong></span>
                  {referralBonus > 0 ? (
                    <span>Referral bonus: <strong className="text-primary">+{referralBonus} interview{referralBonus === 1 ? '' : 's'}</strong></span>
                  ) : null}
                </div>

                {lowLimitNotice ? (
                  <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                    {lowLimitNotice}
                  </div>
                ) : null}
              </div>
            </section>

            {referrals && showReferralSection ? (
              <section className="card relative overflow-hidden p-6 slide-up">
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
                <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                      <GiftIcon size={14} />
                      Referral boost
                    </div>
                    <h2 className="text-2xl font-semibold text-primary">
                      {hasUnlimitedReferrals ? 'Admin referral workspace with unlimited invites' : 'Invite up to 3 people and earn extra interviews'}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-secondary">
                      {hasUnlimitedReferrals
                        ? 'Admin access removes referral slot caps while still tracking every joined referral cleanly.'
                        : 'Share your referral link from here. One referral slot is for one real person only, and each joined email gives exactly 1 extra interview only once.'}
                    </p>

                    <div className="mt-5 rounded-3xl border border-border bg-hover p-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Your referral link</div>
                      <div className="mt-2 break-all text-sm font-medium text-primary">{referrals.referral_url}</div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={handleCopyReferralLink} className="btn-primary !px-5 !py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <ShareIcon size={15} />
                            Copy link
                          </span>
                        </button>
                        <a
                          href={referrals.referral_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary !px-5 !py-2.5"
                        >
                          Preview invite page
                        </a>
                      </div>
                      {copyStatus ? <div className="mt-3 text-sm text-secondary">{copyStatus}</div> : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-3xl border border-border bg-hover px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Slots left</div>
                      <div className="mt-2 text-3xl font-semibold text-primary">
                        {hasUnlimitedReferrals ? 'Unlimited' : referrals.remaining_slots}
                      </div>
                      <div className="mt-1 text-sm text-secondary">
                        {hasUnlimitedReferrals ? 'Admin referral override is active' : `${referrals.total_slots} total slots. One queued or joined email uses one slot.`}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-border bg-hover px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Reserved emails</div>
                      <div className="mt-2 text-3xl font-semibold text-primary">
                        {referrals.entries.filter(entry => entry.status === 'queued').length}
                      </div>
                      <div className="mt-1 text-sm text-secondary">Each reserved email can join only once</div>
                    </div>
                    <div className="rounded-3xl border border-border bg-hover px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Rewards earned</div>
                      <div className="mt-2 text-3xl font-semibold text-primary">{referrals.successful_referrals}</div>
                      <div className="mt-1 text-sm text-secondary">Exactly 1 interview reward per joined email</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-primary">Referral activity</div>
                  <div className="mt-3 space-y-3">
                    {referrals.entries.length ? referrals.entries.map(entry => (
                      <div key={`${entry.email}-${entry.created_at}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-hover px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-primary">{entry.email}</div>
                          <div className="mt-1 text-xs text-secondary">
                            {entry.status === 'joined'
                              ? `Joined${entry.joined_at ? ` on ${new Date(entry.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
                              : 'Queued and waiting for signup'}
                          </div>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                          entry.status === 'joined'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-blue-500/15 text-blue-300'
                        }`}>
                          {entry.status}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-border bg-hover px-4 py-4 text-sm text-secondary">
                        {hasUnlimitedReferrals
                          ? 'No referrals queued yet. Share your admin link as widely as you want and each completed join will still be tracked once per real user.'
                          : 'No referrals queued yet. Share your link from here and each of your 3 referral slots will count only once per joined email.'}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="device-safe-panel px-6 py-5 slide-up">
              <div className="grid gap-4 md:grid-cols-4">
                <Link href="/analytics" className="device-safe-card px-4 py-4">
                  <div className="device-safe-title text-sm font-semibold">Analytics page</div>
                  <div className="device-safe-body mt-1 text-sm">Open insights, focus suggestions, and performance details there.</div>
                </Link>
                <Link href="/history" className="device-safe-card px-4 py-4">
                  <div className="device-safe-title text-sm font-semibold">Sessions page</div>
                  <div className="device-safe-body mt-1 text-sm">Recent and older interview sessions now stay off the main page.</div>
                </Link>
                <Link href="/pricing" className="device-safe-card px-4 py-4">
                  <div className="device-safe-title text-sm font-semibold">Billing page</div>
                  <div className="device-safe-body mt-1 text-sm">Use billing for upgrades, locked plans, and access restoration.</div>
                </Link>
                <Link href="/settings" className="device-safe-card px-4 py-4">
                  <div className="device-safe-title text-sm font-semibold">Workspace settings</div>
                  <div className="device-safe-body mt-1 text-sm">Theme and workspace controls remain in their own page.</div>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
