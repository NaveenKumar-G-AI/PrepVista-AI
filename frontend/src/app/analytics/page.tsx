'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { ArrowUpRightIcon, ChartIcon, CrownIcon, PlayIcon, SparklesIcon, TargetIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getStartInterviewHref, isUnlimitedUsage, hasRemainingUsage, PlanUsage } from '@/lib/plan-usage';

interface DashboardAnalytics {
  user: {
    active_plan: string;
    prep_goal: string | null;
  };
  stats: {
    total_sessions: number;
    average_score: number | null;
    best_score: number | null;
    total_questions: number;
  };
  usage: PlanUsage;
  skill_scores?: Record<string, { score: number; last_updated: string }>;
  analytics_feedback?: {
    coach_insight: string;
    recommended_mode: string;
    strongest_signal: string;
    improvement_signal: string;
    next_step: string;
  };
}

interface SkillTrendResponse {
  skill_trends: Record<string, Array<{ score: number; date: string }>>;
}

function formatCategoryName(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeCategoryKey(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getDifficultyLabel(totalSessions: number, averageScore: number | null) {
  if (totalSessions === 0) {
    return 'Foundation';
  }
  if ((averageScore ?? 0) >= 75) {
    return 'Advanced';
  }
  if ((averageScore ?? 0) >= 55) {
    return 'Intermediate';
  }
  return 'Foundation';
}

function getEstimatedTime(plan: string) {
  if (plan === 'career') {
    return '18 min';
  }
  if (plan === 'pro') {
    return '12 min';
  }
  return '8 min';
}

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardAnalytics | null>(null);
  const [trends, setTrends] = useState<SkillTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

    Promise.all([
      api.getDashboard<DashboardAnalytics>(),
      api.getSkills<SkillTrendResponse>(),
    ])
      .then(([dashboardData, trendData]) => {
        setDashboard(dashboardData);
        setTrends(trendData);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load analytics.');
      })
      .finally(() => setLoading(false));
  }, [authLoading, router, user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  const skillEntries = Object.entries(dashboard?.skill_scores || {}).sort((left, right) => right[1].score - left[1].score);
  const strongestSkill = skillEntries[0];
  const weakestSkill = skillEntries[skillEntries.length - 1];
  const activePlan = dashboard?.user.active_plan || user.active_plan || user.plan || 'free';
  const totalSessions = dashboard?.stats.total_sessions ?? 0;
  const averageScore = dashboard?.stats.average_score ?? null;
  const bestScore = dashboard?.stats.best_score ?? null;
  const unlimited = isUnlimitedUsage(dashboard?.usage || user.usage);
  const recommendedMode = dashboard?.analytics_feedback?.recommended_mode || (unlimited
    ? 'Career Deep Dive'
    : activePlan === 'pro'
      ? 'Technical Mock'
      : 'Core Confidence Mock');

  let coachInsightText = 'Complete your first interview to unlock tailored coaching on structure, clarity, and depth.';
  if (strongestSkill && weakestSkill && strongestSkill[0] !== weakestSkill[0]) {
    coachInsightText = `You communicate best in ${formatCategoryName(strongestSkill[0])}, but ${formatCategoryName(weakestSkill[0])} needs better structure and more precise examples.`;
  } else if (strongestSkill) {
    coachInsightText = `Your ${formatCategoryName(strongestSkill[0])} answers are currently the strongest. Keep using that structure in the next round.`;
  } else if (totalSessions > 0) {
    coachInsightText = 'Your completed interviews are now feeding analytics. Refresh shortly if a session finished a few moments ago.';
  }
  if (dashboard?.analytics_feedback?.coach_insight) {
    coachInsightText = dashboard.analytics_feedback.coach_insight;
  }
  const strongestSignalText = dashboard?.analytics_feedback?.strongest_signal || (
    strongestSkill
      ? `This is your strongest scoring category right now at ${Math.round(strongestSkill[1].score)}%. Keep repeating the structure and confidence that already works here.`
      : totalSessions > 0
        ? 'Your finished interviews are being translated into category signals now.'
        : 'Complete one interview and the AI will start highlighting your most consistent category.'
  );
  const improvementSignalText = dashboard?.analytics_feedback?.improvement_signal || (
    weakestSkill
      ? `This category is the clearest opportunity for score growth. Add stronger examples, better structure, and fuller reasoning to raise it from ${Math.round(weakestSkill[1].score)}%.`
      : totalSessions > 0
        ? 'Your completed interviews are syncing into recommendations for where to focus next.'
        : 'Once you finish your first interview, the platform will tell you exactly where to focus next.'
  );
  const nextStepText = dashboard?.analytics_feedback?.next_step || 'Use your current analytics as a brief, then run one more interview immediately while the recommendation is fresh. The fastest gains usually come from short feedback loops.';

  const performanceCards = [
    {
      title: 'Sessions Completed',
      value: totalSessions > 0 ? String(totalSessions) : 'No sessions yet',
      helper: totalSessions > 0
        ? 'Finished interviews are now updating your analytics automatically.'
        : 'Complete one interview to unlock this insight.',
    },
    {
      title: 'Average Score',
      value: averageScore != null ? `${Math.round(averageScore)}%` : 'Awaiting first score',
      helper: averageScore != null
        ? 'Updated after each completed interview.'
        : 'Complete one interview to unlock this insight.',
    },
    {
      title: 'Best Score',
      value: bestScore != null ? `${Math.round(bestScore)}%` : 'No benchmark yet',
      helper: bestScore != null
        ? 'Your highest finished-session score so far.'
        : 'Complete one interview to unlock this insight.',
    },
  ];

  const categoryConfigs = [
    { title: 'Introduction', aliases: ['introduction'] },
    { title: 'Behavioral', aliases: ['behavioral'] },
    { title: 'Project Ownership', aliases: ['project ownership'] },
    { title: 'Communication', aliases: ['communication'] },
  ];

  const categorySnapshots = categoryConfigs.map(config => {
    const trendKey = Object.keys(trends?.skill_trends || {}).find(key =>
      config.aliases.includes(normalizeCategoryKey(key)),
    );
    const skillKey = Object.keys(dashboard?.skill_scores || {}).find(key =>
      config.aliases.includes(normalizeCategoryKey(key)),
    );

    const trendSeries = trendKey ? trends?.skill_trends?.[trendKey] || [] : [];
    const latest = trendSeries[trendSeries.length - 1];
    const first = trendSeries[0];
    const fallbackSkillScore = skillKey ? dashboard?.skill_scores?.[skillKey]?.score : null;
    const score = Math.round(latest?.score ?? fallbackSkillScore ?? 0);
    const checkpoints = trendSeries.length || (fallbackSkillScore != null ? 1 : 0);
    const delta = latest && first ? Math.round(latest.score - first.score) : 0;

    return {
      title: config.title,
      score,
      checkpoints,
      delta,
      hasData: checkpoints > 0,
    };
  });

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader backHref="/dashboard" backLabel="Back to main" />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.2),transparent_24%),radial-gradient(circle_at_80%_15%,rgba(99,102,241,0.18),transparent_28%),linear-gradient(135deg,#081120_0%,#101a32_100%)] px-7 py-8 text-white shadow-[0_28px_70px_rgba(2,8,23,0.32)] fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
            <ChartIcon size={14} />
            Analytics workspace
          </div>
          <h1 className="text-4xl font-bold tracking-[-0.03em] text-white">Coaching signals and performance trends</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Review coaching direction, score movement, and category-level performance trends in one focused analytics workspace.
          </p>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-2 slide-up">
          <div className="card p-6">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <SparklesIcon size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">AI Coach Insight</div>
            <h2 className="mt-3 text-2xl font-semibold text-primary">Your next coaching edge</h2>
            <p className="mt-3 text-sm leading-7 text-secondary">{coachInsightText}</p>
            <div className="mt-5">
              <Link 
                href={startInterviewHref} 
                className="btn-secondary"
                onClick={(e) => {
                  const currentUsage = dashboard?.usage || user?.usage;
                  if (!hasRemainingUsage(currentUsage)) {
                    e.preventDefault();
                    const plan = (activePlan || 'free').toLowerCase();
                    const upgradeTo = plan === 'career' ? 'Career' : plan === 'pro' ? 'Career' : 'Pro or Career';
                    alert(`Your quota is reached. If you want to use more, please buy ${upgradeTo} based on your current plan.`);
                    router.push('/pricing');
                  }
                }}
              >
                <span className="inline-flex items-center gap-2">
                  Generate Practice Plan
                  <ArrowUpRightIcon size={16} />
                </span>
              </Link>
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
              <TargetIcon size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Today&apos;s Focus</div>
            <h2 className="mt-3 text-2xl font-semibold text-primary">Recommended practice direction</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-hover px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Mode</div>
                <div className="mt-2 text-sm font-semibold text-primary">{recommendedMode}</div>
              </div>
              <div className="rounded-2xl border border-border bg-hover px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Difficulty</div>
                <div className="mt-2 text-sm font-semibold text-primary">{getDifficultyLabel(totalSessions, averageScore)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-hover px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-tertiary">Estimated time</div>
                <div className="mt-2 text-sm font-semibold text-primary">{getEstimatedTime(activePlan)}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-secondary">
              {dashboard?.user.prep_goal
                ? `This focus is tuned around your prep goal: ${dashboard.user.prep_goal}.`
                : nextStepText}
            </p>
            <div className="mt-5">
              <Link 
                href={startInterviewHref} 
                className="btn-primary"
                onClick={(e) => {
                  const currentUsage = dashboard?.usage || user?.usage;
                  if (!hasRemainingUsage(currentUsage)) {
                    e.preventDefault();
                    const plan = (activePlan || 'free').toLowerCase();
                    const upgradeTo = plan === 'career' ? 'Career' : plan === 'pro' ? 'Career' : 'Pro or Career';
                    alert(`Your quota is reached. If you want to use more, please buy ${upgradeTo} based on your current plan.`);
                    router.push('/pricing');
                  }
                }}
              >
                <span className="inline-flex items-center gap-2">
                  Begin Recommended Session
                  <PlayIcon size={16} />
                </span>
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 slide-up">
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Performance overview</div>
            <h2 className="mt-2 text-2xl font-semibold text-primary">Your current performance signals</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {performanceCards.map(card => (
              <div key={card.title} className="card p-5 interactive-card">
                <div className="mb-3 text-sm font-semibold text-primary">{card.value}</div>
                <div className="text-lg font-semibold text-primary">{card.title}</div>
                <p className="mt-3 text-sm leading-6 text-secondary">{card.helper}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-2 slide-up">
          <div className="card p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Strongest signal</div>
            <h2 className="mt-3 text-2xl font-semibold text-primary">
              {strongestSkill ? formatCategoryName(strongestSkill[0]) : 'Awaiting first coaching signal'}
            </h2>
            <p className="mt-3 text-sm leading-7 text-secondary">
              {strongestSignalText}
            </p>
          </div>

          <div className="card p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Next improvement edge</div>
            <h2 className="mt-3 text-2xl font-semibold text-primary">
              {weakestSkill ? formatCategoryName(weakestSkill[0]) : 'Practice to unlock recommendations'}
            </h2>
            <p className="mt-3 text-sm leading-7 text-secondary">
              {improvementSignalText}
            </p>
          </div>
        </section>

        <section className="mt-6 slide-up">
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Skill trend detail</div>
            <h2 className="mt-2 text-2xl font-semibold text-primary">Latest category snapshots</h2>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map(item => (
                <div key={item} className="card h-40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {categorySnapshots.map(snapshot => (
                <div key={snapshot.title} className="card p-5 interactive-card">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">{snapshot.title}</div>
                  <div className="mt-3 text-3xl font-bold tracking-[-0.03em] text-primary">{snapshot.score}%</div>
                  <div className="mt-2 text-sm text-secondary">
                    {snapshot.checkpoints} recorded checkpoint{snapshot.checkpoints === 1 ? '' : 's'}
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#3b82f6,#6366f1)]"
                      style={{ width: `${Math.max(12, Math.min(100, snapshot.score))}%` }}
                    />
                  </div>
                  <div className="mt-4 text-sm">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${snapshot.delta >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                      {snapshot.hasData ? (snapshot.delta >= 0 ? `+${snapshot.delta}% trend` : `${snapshot.delta}% trend`) : 'Trend pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr] slide-up">
          <div className="card p-6">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <PlayIcon size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Suggested next move</div>
            <h2 className="mt-3 text-2xl font-semibold text-primary">Turn this insight into practice</h2>
            <p className="mt-3 text-sm leading-7 text-secondary">
              {nextStepText}
            </p>
            <div className="mt-5">
              <Link 
                href={startInterviewHref} 
                className="btn-primary"
                onClick={(e) => {
                  const currentUsage = dashboard?.usage || user?.usage;
                  if (!hasRemainingUsage(currentUsage)) {
                    e.preventDefault();
                    const plan = (activePlan || 'free').toLowerCase();
                    const upgradeTo = plan === 'career' ? 'Career' : plan === 'pro' ? 'Career' : 'Pro or Career';
                    alert(`Your quota is reached. If you want to use more, please buy ${upgradeTo} based on your current plan.`);
                    router.push('/pricing');
                  }
                }}
              >
                <span className="inline-flex items-center gap-2">
                  Begin next session
                  <ArrowUpRightIcon size={16} />
                </span>
              </Link>
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              <CrownIcon size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">Analytics note</div>
            <h2 className="mt-3 text-2xl font-semibold text-primary">Coaching becomes stronger with repetition</h2>
            <p className="mt-3 text-sm leading-7 text-secondary">
              More completed sessions create better coaching direction. The AI becomes more useful when it can compare multiple answers, multiple score patterns, and multiple categories over time.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
