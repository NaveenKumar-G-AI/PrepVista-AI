'use client';
/**
 * PrepVista — Student Dashboard Page
 * Dedicated workspace for org_student users.
 * No plan management, no referrals, no launch offers — focused on interview practice.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { BoltIcon, HistoryIcon, PlayIcon, SparklesIcon, TargetIcon } from '@/components/icons';
import { StudentSideRail } from '@/components/student-side-rail';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { hasRemainingUsage, isUnlimitedUsage, PlanUsage } from '@/lib/plan-usage';

interface StudentDashboardData {
  user: {
    name: string | null;
    plan: string;
    active_plan: string;
    owned_plans: string[];
    expired_plans: string[];
    highest_owned_plan: string;
    onboarding_completed: boolean;
    prep_goal: string | null;
  };
  usage: PlanUsage;
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

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

export default function StudentDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [error, setError] = useState('');
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);
  const router = useRouter();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!user.org_student) {
      router.replace('/dashboard');
      return;
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (fetchedRef.current) return;
    if (!authLoading && !user) return; // Will be redirected

    fetchedRef.current = true;
    const fetchDashboard = async () => {
      try {
        const dashboardData = await api.getDashboard<StudentDashboardData>();
        setData(dashboardData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load your workspace.');
      }
    };

    void fetchDashboard();
  }, [authLoading, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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

  // Skeleton while loading
  if (authLoading || (!user && !error)) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="skeleton-card h-48 w-full mb-6" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 mb-6">
          <div className="skeleton-card h-36" />
          <div className="skeleton-card h-36" />
          <div className="skeleton-card h-36" />
        </div>
      </div>
    );
  }

  const workspaceUser = data?.user;
  const usage = data?.usage || user?.usage;
  const greetingName = (workspaceUser?.name || user?.full_name || 'there').split(' ')[0];
  const prepGoal = workspaceUser?.prep_goal;
  const unlimited = isUnlimitedUsage(usage) || (usage?.limit ?? 0) >= 9000;
  const usageUsed = usage?.used ?? 0;
  const usageLimit = usage?.limit ?? 0;
  const usageRemaining = usage?.remaining ?? 0;
  const usageProgress = unlimited ? 100 : Math.min(100, (usageUsed / Math.max(usageLimit, 1)) * 100);
  const startInterviewHref = hasRemainingUsage(usage) ? '/interview/setup' : '/student-dashboard';
  const liveSessionHref = storedSessionId ? `/interview/${storedSessionId}` : '/history';
  const hasQuota = hasRemainingUsage(usage);
  const currentFeedbackSessionId =
    data?.current_feedback_session_id
    || data?.recent_sessions?.find(session => session.state === 'FINISHED')?.id
    || null;
  const currentFeedbackHref = currentFeedbackSessionId ? `/report/${currentFeedbackSessionId}` : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
      <StudentSideRail
        startInterviewHref={startInterviewHref}
        liveSessionHref={liveSessionHref}
        hasQuota={hasQuota}
      />

      <div className="space-y-6">
        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.22),transparent_25%),radial-gradient(circle_at_85%_18%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(135deg,#07111f_0%,#0c1830_48%,#0f1b31_100%)] px-7 py-8 text-white shadow-[0_30px_80px_rgba(2,8,23,0.34)] fade-in md:px-8 md:py-10">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <div className="absolute left-10 top-8 h-24 w-24 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10 max-w-4xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
              <SparklesIcon size={14} />
              Student Workspace
            </div>
            <div className="text-sm font-medium text-slate-300">Welcome back, {greetingName}</div>
            <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
              Your interview practice workspace is ready
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              {unlimited
                ? 'Unlimited interview access is active via your college.'
                : `${usageRemaining} interview session${usageRemaining === 1 ? '' : 's'} remaining.`}
              {' '}
              {prepGoal
                ? `Current prep goal: ${prepGoal}. Keep momentum with one focused session today.`
                : 'Stay in motion with one focused session today, then use analytics to improve the next one.'}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={startInterviewHref}
                className="btn-primary !px-6 !py-3.5"
                onClick={(e) => {
                  if (!hasQuota) {
                    e.preventDefault();
                    alert('Your quota is reached. Contact your college administrator to get more access.');
                  }
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <PlayIcon size={16} />
                  Start Interview
                </span>
              </Link>
              <Link href="/history" className="btn-secondary !px-6 !py-3.5">
                <span className="inline-flex items-center gap-2">
                  <HistoryIcon size={16} />
                  Open Sessions
                </span>
              </Link>
            </div>

            {/* College-managed badge */}
            <div className="mt-7 flex flex-wrap gap-3">
              <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200">
                Plan: <span className="font-semibold text-white">Career</span>
              </div>
              <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200">
                Access: <span className="font-semibold text-white">College Managed</span>
              </div>
            </div>
          </div>
        </section>

        {/* Usage + Quick Actions Row */}
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr] slide-up">
          {/* Usage Card */}
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
                  {unlimited ? 'Unlimited interview access is active via your college.' : `${usageRemaining} of ${usageLimit} sessions remaining this cycle.`}
                </p>
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
              <span>Plan: <strong className="text-primary">Career</strong></span>
            </div>
          </div>

          {/* Interview Context Card */}
          <div className="card relative overflow-visible p-6">
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
            <div className="mb-5">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                <TargetIcon size={14} />
                Interview workspace
              </div>
              <h2 className="text-2xl font-semibold text-primary">Ready for your next session</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-secondary">
                Career-level interview simulation with detailed coaching, evaluation, and downloadable PDF reports.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-hover px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Access level</div>
                <div className="mt-2 text-base font-semibold text-primary">Career</div>
              </div>
              <div className="rounded-2xl border border-border bg-hover px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Managed by</div>
                <div className="mt-2 text-base font-semibold text-primary">Your College</div>
              </div>
              <div className="rounded-2xl border border-border bg-hover px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Next step</div>
                <div className="mt-2 text-base font-semibold text-primary">{hasQuota ? 'Start a fresh interview' : 'Contact your admin'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Sessions */}
        {data?.recent_sessions?.length ? (
          <section className="card relative overflow-hidden !p-6 slide-up">
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-primary">Recent Sessions</h2>
              <Link href="/history" className="text-sm text-blue-500 hover:text-blue-400 transition-colors">View all →</Link>
            </div>
            <div className="space-y-2">
              {data.recent_sessions.slice(0, 5).map(session => (
                <Link
                  key={session.id}
                  href={session.state === 'FINISHED' ? `/report/${session.id}` : `/interview/${session.id}`}
                  className="flex items-center justify-between rounded-2xl border border-border bg-hover px-4 py-3 transition-colors hover:border-blue-500/30"
                >
                  <div>
                    <div className="text-sm font-medium text-primary">
                      {session.state === 'FINISHED' ? `Score: ${session.final_score}/100` : 'In Progress'}
                    </div>
                    <div className="mt-0.5 text-xs text-secondary">
                      {formatDateTime(session.created_at)}
                      {session.duration ? ` · ${formatDuration(session.duration)}` : ''}
                      {session.total_turns ? ` · ${session.total_turns} questions` : ''}
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    session.state === 'FINISHED'
                      ? 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                  }`}>
                    {session.state === 'FINISHED' ? 'Completed' : session.state}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Quick Links Footer */}
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
            <div className="device-safe-card px-4 py-4">
              <div className="device-safe-title text-sm font-semibold">College-Managed Plan</div>
              <div className="device-safe-body mt-1 text-sm">Your college manages your plan and access. Contact your admin for changes.</div>
            </div>
            <Link href="/settings" className="device-safe-card px-4 py-4">
              <div className="device-safe-title text-sm font-semibold">Workspace settings</div>
              <div className="device-safe-body mt-1 text-sm">Theme and workspace controls remain in their own page.</div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
