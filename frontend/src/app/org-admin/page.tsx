'use client';
/**
 * PrepVista — College Admin Dashboard
 * Overview: enrollment stats, performance KPIs, readiness tier distribution,
 * weakest skill categories, zero-offer risk alert, and quick actions.
 *
 * Data source: GET /org/my/dashboard  (extended org_college.py)
 * Zero additional API calls — all new data comes from the single dashboard fetch.
 *
 * Extended (MBP-1 extreme version):
 *   BUGS FIXED:
 *     - Tailwind dynamic class interpolation (`bg-${color}-500`) removed. Tailwind's
 *       JIT/tree-shaker statically scans source for class names — dynamically built
 *       strings are excluded from the production CSS bundle. All color classes now
 *       appear as complete string literals in static lookup objects.
 *     - DashboardData interface had no `performance_summary` field — the entire new
 *       backend payload was received then silently discarded. Full typed interface added.
 *     - Bare spinner replaced with DashboardSkeleton (layout-matched pulse animation).
 *
 *   NEW CAPABILITIES:
 *     - Cohort avg score stat card + hero KPI pill (color-coded by score range).
 *     - Seat usage visual progress bar (green/amber/rose by utilisation %).
 *     - ReadinessMiniGrid: 4-tile traffic-light readiness tier distribution.
 *     - WeakestCategoriesWidget: 3 score progress bars for weakest rubric categories.
 *     - ZeroRiskAlert: dismissible rose alert when zero-offer risk students exist.
 *     - Low-engagement nudge: amber hero banner when < 30% of cohort has practiced.
 *     - Quick Actions extended from 4 → 6 (adds Performance, Growth, Readiness).
 *     - All state handled from the single existing API call. Zero extra round-trips.
 *     - performance_summary typed as optional → graceful degradation on old backend.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { BuildingIcon, ChartIcon, KeyIcon, SparklesIcon, UsersIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';


// ══════════════════════════════════════════════════════════════════════════════
// TYPESCRIPT INTERFACES
// ══════════════════════════════════════════════════════════════════════════════

interface WeakCategory {
  name: string;
  avg_score: number | null;
}

interface ReadinessTierCounts {
  ready: number;
  almost_ready: number;
  developing: number;
  at_risk: number;
}

/** New block returned by the extended org_college.py dashboard endpoint.
 *  Typed as optional so the page degrades gracefully if an older backend
 *  version is running — all existing fields continue to render correctly. */
interface PerformanceSummary {
  cohort_avg_score: number | null;
  students_with_sessions: number;
  readiness_tier_counts: ReadinessTierCounts;
  zero_offer_risk_count: number;
  weakest_3_categories: WeakCategory[];
}

interface RecentStudent {
  id: string;
  student_code: string | null;
  has_career_access: boolean;
  added_at: string;
  email: string;
  full_name: string | null;
}

interface DashboardData {
  organization: Record<string, unknown>;
  total_students: number;
  career_access_students: number;
  departments: number;
  years: number;
  batches: number;
  seat_limit: number;
  seats_used: number;
  recent_students: RecentStudent[];
  /** Extended by MBP-1 backend work. Optional: page degrades safely without it. */
  performance_summary?: PerformanceSummary;
}


// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function formatDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "structure_star" → "Structure / STAR"  |  "technical_depth" → "Technical Depth" */
function formatCategoryName(name: string): string {
  return name
    .split('_')
    .map(w => (w === 'star' ? '/ STAR' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Pre-defined Tailwind bar-fill color based on score.
 *  Returns a complete class string — never interpolated, always tree-shaken correctly. */
function scoreBarColor(score: number | null): string {
  if (score === null) return 'bg-slate-600';
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

/** Pre-defined Tailwind text color based on score. */
function scoreTextColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 75) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-rose-400';
}

/** Dynamic accent for avg-score stat card. */
function avgScoreAccent(score: number | null): keyof typeof STAT_ACCENT_STYLES {
  if (score === null) return 'blue';
  if (score >= 75) return 'emerald';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'amber';
  return 'rose';
}


// ══════════════════════════════════════════════════════════════════════════════
// STATIC CONFIG OBJECTS
// All Tailwind class strings appear here as complete literals. Tailwind's JIT
// tree-shaker statically scans source — dynamically interpolated strings like
// `bg-${color}-500` are NOT included in the production CSS bundle and cause
// silent visual breakage. Every class below is safe for production builds.
// ══════════════════════════════════════════════════════════════════════════════

/** StatCard accent theme lookup. */
const STAT_ACCENT_STYLES = {
  blue: { ring: 'from-blue-500/20 to-blue-600/5 ring-blue-500/15', text: 'text-blue-400' },
  emerald: { ring: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15', text: 'text-emerald-400' },
  violet: { ring: 'from-violet-500/20 to-violet-600/5 ring-violet-500/15', text: 'text-violet-400' },
  amber: { ring: 'from-amber-500/20 to-amber-600/5 ring-amber-500/15', text: 'text-amber-400' },
  cyan: { ring: 'from-cyan-500/20 to-cyan-600/5 ring-cyan-500/15', text: 'text-cyan-400' },
  rose: { ring: 'from-rose-500/20 to-rose-600/5 ring-rose-500/15', text: 'text-rose-400' },
} as const;

type AccentKey = keyof typeof STAT_ACCENT_STYLES;

/** Traffic-light style config per readiness tier. */
const TIER_CONFIG: Record<
  keyof ReadinessTierCounts,
  { label: string; bar: string; text: string; bg: string; border: string }
> = {
  ready: { label: 'Placement Ready', bar: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  almost_ready: { label: 'Almost Ready', bar: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  developing: { label: 'Developing', bar: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  at_risk: { label: 'At Risk', bar: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
};

/** Quick action link definitions — all Tailwind classes pre-defined as literals. */
const QUICK_ACTIONS = [
  {
    href: '/org-admin/students',
    label: 'Manage Students',
    desc: 'Add, edit, or bulk upload',
    Icon: UsersIcon,
    iconBg: 'bg-blue-500/15',
    iconText: 'text-blue-400',
  },
  {
    href: '/org-admin/access-control',
    label: 'Access Control',
    desc: 'Grant or revoke career access',
    Icon: KeyIcon,
    iconBg: 'bg-emerald-500/15',
    iconText: 'text-emerald-400',
  },
  {
    href: '/org-admin/departments',
    label: 'Departments',
    desc: 'Manage segments & batches',
    Icon: BuildingIcon,
    iconBg: 'bg-amber-500/15',
    iconText: 'text-amber-400',
  },
  {
    href: '/org-admin/analytics/performance',
    label: 'Performance',
    desc: 'Category scores & cohort radar',
    Icon: ChartIcon,
    iconBg: 'bg-violet-500/15',
    iconText: 'text-violet-400',
  },
  {
    href: '/org-admin/analytics/growth',
    label: 'Growth Tracking',
    desc: 'Session trends & stuck students',
    Icon: ChartIcon,
    iconBg: 'bg-cyan-500/15',
    iconText: 'text-cyan-400',
  },
  {
    href: '/org-admin/analytics/readiness',
    label: 'Readiness Report',
    desc: 'Placement tiers & zero-offer risk',
    Icon: SparklesIcon,
    iconBg: 'bg-rose-500/15',
    iconText: 'text-rose-400',
  },
] as const;


// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Enrollment / KPI stat card.
 * accent drives color via STAT_ACCENT_STYLES lookup — never interpolated,
 * so Tailwind includes all variants in the production bundle correctly.
 */
function StatCard({
  label,
  value,
  helper,
  accent = 'blue',
}: {
  label: string;
  value: string | number;
  helper: string;
  accent?: AccentKey;
}) {
  const s = STAT_ACCENT_STYLES[accent] ?? STAT_ACCENT_STYLES.blue;
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${s.ring} p-5 ring-1 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]`}
    >
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.03]" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${s.text}`}>{value}</div>
      <div className="mt-1 text-[12px] text-slate-500">{helper}</div>
    </div>
  );
}

/**
 * Visual progress bar for seat utilisation, shown inside the seat usage card.
 * Color: emerald < 75% · amber 75–89% · rose ≥ 90%
 */
function SeatUsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const barColor =
    pct >= 90 ? 'bg-rose-500'
      : pct >= 75 ? 'bg-amber-500'
        : 'bg-emerald-500';
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 4-tile traffic-light readiness distribution grid.
 * One tile per tier: ready / almost_ready / developing / at_risk.
 * Each tile shows count, label, proportional bar, and percentage.
 * Renders an empty-state card when total === 0 (no session data yet).
 */
function ReadinessMiniGrid({
  counts,
  total,
}: {
  counts: ReadinessTierCounts;
  total: number;
}) {
  const tiers = ['ready', 'almost_ready', 'developing', 'at_risk'] as const;

  return (
    <div className="card !p-6">
      <h3 className="mb-1 text-sm font-semibold text-white">Readiness Distribution</h3>
      <p className="mb-4 text-xs text-slate-500">
        {total > 0
          ? `${total} students classified across 4 placement tiers`
          : 'Appears once students complete their first interview'}
      </p>

      {total > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiers.map(tier => {
              const cfg = TIER_CONFIG[tier];
              const count = counts[tier];
              const pct = Math.round((count / total) * 100);
              return (
                <div
                  key={tier}
                  className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-3 text-center`}
                >
                  <div className={`text-2xl font-bold ${cfg.text}`}>{count}</div>
                  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {cfg.label}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${cfg.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{pct}%</div>
                </div>
              );
            })}
          </div>
          <Link
            href="/org-admin/analytics/readiness"
            className="mt-4 block text-center text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Full readiness report →
          </Link>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-6 text-center text-xs text-slate-500">
          No interview data yet
        </div>
      )}
    </div>
  );
}

/**
 * Three labeled score progress bars for the cohort's weakest rubric categories.
 * Bar width = avg_score / 100. Color coded by score threshold.
 * Returns null when categories array is empty — hidden cleanly before data exists.
 */
function WeakestCategoriesWidget({ categories }: { categories: WeakCategory[] }) {
  if (!categories.length) return null;

  return (
    <div className="card !p-6">
      <h3 className="mb-1 text-sm font-semibold text-white">Weakest Skill Areas</h3>
      <p className="mb-4 text-xs text-slate-500">
        Cohort averages — lowest 3 categories need training focus
      </p>

      <div className="space-y-4">
        {categories.map(cat => (
          <div key={cat.name}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                {formatCategoryName(cat.name)}
              </span>
              <span
                className={`text-xs font-bold tabular-nums ${scoreTextColor(cat.avg_score)}`}
              >
                {cat.avg_score !== null ? `${cat.avg_score}/100` : 'No data'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(cat.avg_score)}`}
                style={{ width: `${cat.avg_score ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/org-admin/analytics/performance"
        className="mt-4 block text-center text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        All 14 categories →
      </Link>
    </div>
  );
}

/**
 * Dismissible rose alert for zero-offer risk students.
 * Returns null when count === 0 — never renders for healthy cohorts.
 * Dismiss is per-render (component state) so TPO sees it on each visit until they act.
 */
function ZeroRiskAlert({
  count,
  onDismiss,
}: {
  count: number;
  onDismiss: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3"
    >
      <span className="mt-0.5 shrink-0 text-base leading-none text-rose-400" aria-hidden>
        ⚠
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rose-300">
          {count} student{count !== 1 ? 's' : ''} at risk of zero placement offers
        </p>
        <p className="mt-0.5 text-xs text-rose-400/80">
          These students need immediate coaching intervention.{' '}
          <Link
            href="/org-admin/analytics/readiness"
            className="underline underline-offset-2 hover:text-rose-300"
          >
            View Readiness Report →
          </Link>
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss zero-offer risk alert"
        className="shrink-0 rounded-full p-1 text-rose-400/60 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Pulse-animated layout skeleton shown during initial data fetch.
 * Mirrors the exact section structure of the loaded page so the TPO sees
 * spatial context while content loads rather than a blank screen.
 */
function DashboardSkeleton() {
  return (
    <div
      className="space-y-6 animate-pulse"
      aria-busy="true"
      aria-label="Loading dashboard…"
    >
      {/* Hero bar */}
      <div className="h-40 rounded-[28px] bg-white/[0.04]" />

      {/* 7 stat card skeletons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-28 rounded-3xl bg-white/[0.04]" />
        ))}
      </div>

      {/* Performance section (2-column) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-52 rounded-3xl bg-white/[0.04]" />
        <div className="h-52 rounded-3xl bg-white/[0.04]" />
      </div>

      {/* 6 quick-action skeletons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-3xl bg-white/[0.04]" />
        ))}
      </div>

      {/* Recent students list */}
      <div className="h-64 rounded-3xl bg-white/[0.04]" />
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function OrgAdminDashboard() {
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [riskDismissed, setRiskDismissed] = useState(false);

  useEffect(() => {
    api
      .getCollegeDashboard<DashboardData>()
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
        setLoading(false);
      });
  }, []);

  // ── Loading state — show layout skeleton, not a bare spinner ──────────────
  if (loading) return <DashboardSkeleton />;

  // ── Derived values (all safe-access — data may be null if fetch failed) ───
  const perf = data?.performance_summary;
  const total = data?.total_students ?? 0;
  const studentsWithSess = perf?.students_with_sessions ?? 0;
  const avgScore = perf?.cohort_avg_score ?? null;
  const readyCount = perf?.readiness_tier_counts.ready ?? 0;
  const zeroRisk = perf?.zero_offer_risk_count ?? 0;
  const seatPct = (data?.seat_limit ?? 0) > 0
    ? Math.min(100, ((data?.seats_used ?? 0) / (data?.seat_limit ?? 1)) * 100)
    : 0;

  // tierSum = denominator for ReadinessMiniGrid percentages
  const tierSum = perf
    ? (perf.readiness_tier_counts.ready +
      perf.readiness_tier_counts.almost_ready +
      perf.readiness_tier_counts.developing +
      perf.readiness_tier_counts.at_risk)
    : 0;

  // Low-engagement nudge: < 30% of enrolled students have practiced
  const lowEngagement = total > 0 && studentsWithSess / total < 0.3;

  return (
    <div className="space-y-6">

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400"
        >
          {error}
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.18),transparent_25%),radial-gradient(circle_at_85%_18%,rgba(99,102,241,0.14),transparent_30%),linear-gradient(135deg,#07111f_0%,#0c1830_48%,#0f1b31_100%)] px-7 py-8 text-white shadow-[0_30px_80px_rgba(2,8,23,0.34)] fade-in">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

          {/* Left: welcome text + headline enrollment line */}
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
              <SparklesIcon size={14} />
              College Dashboard
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">
              Welcome, {(user?.full_name || 'Admin').split(' ')[0]}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300">
              {total} students enrolled
              {' · '}
              {data?.career_access_students ?? 0} with career access
              {readyCount > 0 && ` · ${readyCount} placement-ready`}.
            </p>
          </div>

          {/* Right: cohort avg score KPI pill — hidden before any sessions exist */}
          {avgScore !== null && (
            <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-center backdrop-blur-sm">
              <div
                className={`text-2xl font-bold tabular-nums ${scoreTextColor(avgScore)}`}
              >
                {avgScore}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Cohort Avg
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                {studentsWithSess} of {total} practiced
              </div>
            </div>
          )}
        </div>

        {/* Low-engagement nudge — shown when < 30% of cohort has practiced */}
        {lowEngagement && (
          <div className="relative z-10 mt-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
            <span aria-hidden className="shrink-0 text-sm">⚠</span>
            <span>
              Only {Math.round((studentsWithSess / total) * 100)}% of your cohort has completed a
              mock interview. Encourage more students to practice for richer analytics.
            </span>
          </div>
        )}
      </section>

      {/* ── Stats Grid — 7 cards ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 slide-up">
        <StatCard
          label="Total Students"
          value={data?.total_students ?? 0}
          helper="Active enrolled"
          accent="blue"
        />
        <StatCard
          label="Career Access"
          value={data?.career_access_students ?? 0}
          helper="With plan granted"
          accent="emerald"
        />
        <StatCard
          label="Departments"
          value={data?.departments ?? 0}
          helper="Active segments"
          accent="violet"
        />
        <StatCard
          label="Years"
          value={data?.years ?? 0}
          helper="Year groups"
          accent="amber"
        />
        <StatCard
          label="Batches"
          value={data?.batches ?? 0}
          helper="Batch groups"
          accent="cyan"
        />

        {/* NEW: Cohort avg score card — shows '—' before any sessions exist */}
        <StatCard
          label="Cohort Avg Score"
          value={avgScore !== null ? avgScore : '—'}
          helper={
            avgScore !== null
              ? `${studentsWithSess} students scored`
              : 'No sessions yet'
          }
          accent={avgScoreAccent(avgScore)}
        />

        {/* Seat usage card with inline visual progress bar (bespoke — StatCard
            doesn't support sub-components, so this is rendered directly) */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 p-5 ring-1 ring-blue-500/15 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.03]" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Seat Usage
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-blue-400">
            {data?.seats_used ?? 0}/{data?.seat_limit ?? 0}
          </div>
          <SeatUsageBar
            used={data?.seats_used ?? 0}
            limit={data?.seat_limit ?? 0}
          />
          <div className="mt-1 text-[12px] text-slate-500">
            {Math.round(seatPct)}% utilized
          </div>
        </div>
      </div>

      {/* ── Zero-Offer Risk Alert (dismissible) ──────────────────────────────── */}
      {!riskDismissed && (
        <ZeroRiskAlert
          count={zeroRisk}
          onDismiss={() => setRiskDismissed(true)}
        />
      )}

      {/* ── Performance Section ───────────────────────────────────────────────── */}
      {perf ? (
        <div className="grid gap-4 lg:grid-cols-2 slide-up">
          <ReadinessMiniGrid
            counts={perf.readiness_tier_counts}
            total={tierSum}
          />
          <WeakestCategoriesWidget
            categories={perf.weakest_3_categories}
          />
        </div>
      ) : (
        // No performance_summary in response: old backend or zero sessions.
        // Renders a clean empty-state card — never crashes or shows blank space.
        <div className="card !p-6 text-center slide-up">
          <div className="text-2xl" aria-hidden>🎯</div>
          <p className="mt-2 text-sm font-semibold text-white">No Interview Data Yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Readiness tiers and skill analytics appear once students complete
            their first AI-evaluated mock interview.
          </p>
          <Link
            href="/org-admin/students"
            className="mt-3 inline-block text-xs text-blue-400 hover:underline"
          >
            Invite students to practice →
          </Link>
        </div>
      )}

      {/* ── Quick Actions — 6 total (extended from 4) ────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 slide-up">
        {QUICK_ACTIONS.map(({ href, label, desc, Icon, iconBg, iconText }) => (
          <Link
            key={href}
            href={href}
            className="card !p-5 group hover:border-blue-500/30 transition-all"
          >
            <div
              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg} ${iconText} mb-3`}
            >
              <Icon size={18} />
            </div>
            <div className="text-sm font-semibold text-white">{label}</div>
            <div className="text-xs text-slate-400 mt-1">{desc}</div>
          </Link>
        ))}
      </div>

      {/* ── Recent Students ───────────────────────────────────────────────────── */}
      <section className="card !p-6 slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recently Added Students</h2>
          <Link
            href="/org-admin/students"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all →
          </Link>
        </div>

        {data?.recent_students?.length ? (
          <div className="space-y-2">
            {data.recent_students.map(s => (
              <Link
                key={s.id}
                href={`/org-admin/students/${s.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.05] transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    {s.full_name || 'Unnamed Student'}
                  </div>
                  <div className="text-xs text-slate-400">{s.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.has_career_access
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-slate-500/15 text-slate-400'
                      }`}
                  >
                    {s.has_career_access ? 'Career' : 'No Access'}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(s.added_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
            No students enrolled yet.{' '}
            <Link href="/org-admin/students" className="text-blue-400 hover:underline">
              Add your first student
            </Link>
            .
          </div>
        )}
      </section>

    </div>
  );
}