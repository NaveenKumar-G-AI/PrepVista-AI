'use client';
/**
 * PrepVista — College Admin: Analytics
 * Route: /org-admin/analytics/page.tsx
 *
 * SECURITY HARDENING:
 * SEC-1  CSV Formula Injection prevention  — CWE-1236, OWASP top CSV risk
 * SEC-2  UTF-8 BOM + RFC 4180 quote escape — safe multi-language CSV export
 * SEC-3  API response shape validation     — rejects malformed / crafted payloads
 * SEC-4  Numeric bounds sanitization       — negative / NaN / overflow stats blocked
 * SEC-5  Error message sanitization        — hides server internals from the UI
 * SEC-6  Auth-error detection + redirect   — expired sessions land on /login cleanly
 * SEC-7  Drill-down URL param sanitization — null-byte strip + length cap
 * SEC-8  Refresh + export cooldown         — prevents API flooding + Blob URL leak
 * SEC-9  Prototype-safe stat processing    — guards against __proto__ API keys
 * SEC-10 SVG gradient ID whitelist         — ID derived only from hardcoded hex stops
 * SEC-11 Cohort API response validation    — same runtime guard as SEC-3 for all 6
 *         new cohort endpoints; malformed payloads throw before reaching components
 * SEC-12 Filter param sanitization         — activeDept length-capped + null-byte
 *         stripped; activeYear range-checked before encoding into SWR keys / URLs
 */

import useSWR from 'swr';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ResponsiveContainer, BarChart as RechartsBarChart,
  Bar, XAxis, YAxis, Tooltip, LabelList,
  PieChart, Pie, Cell,
} from 'recharts';
import { api } from '@/lib/api';

// ─── Types: existing ─────────────────────────────────────────────────────────
interface AnalyticsData {
  total_students: number;
  career_access_students: number;
  total_students_trend?: number;
  career_access_trend?: number;
  access_rate_trend?: number;
  department_stats: Array<{ department_name: string; total: number; with_access: number }>;
  year_stats: Array<{ year_name: string; total: number; with_access: number }>;
  batch_stats: Array<{ batch_name: string; total: number; with_access: number }>;
}

// ─── Types: new (cohort analytics — shapes match analytics.py Phase 2 spec) ──

interface ReadinessTier {
  tier: string;
  color: string;   // "green" | "yellow" | "orange" | "red" | "gray"
  count: number;
  pct: number;
}
interface ReadinessGridRow {
  user_id: string;
  full_name: string;
  department: string | null;
  graduation_year: number | null;
  latest_score: number | null;
  session_count: number;
  readiness_tier: string;
  readiness_color: string;
}
interface PercentileBucket { range_start: number; range_end: number; count: number; }

// Combined distribution endpoint response
interface CohortReadinessData {
  readiness: {
    tiers: ReadinessTier[];
    total_students: number;
    grid: ReadinessGridRow[];
  };
  percentile: {
    buckets: PercentileBucket[];
    total_scored_students: number;
    not_started_students: number;
    mean: number | null;
    median: number | null;
    std_dev: number | null;
  };
}

interface CategoryRollupRow {
  category: string;
  label: string;
  cohort_avg_latest: number | null;
  cohort_avg_first: number | null;
  cohort_avg_delta: number | null;
  student_count: number;
}
interface CategoryRollupsData {
  by_category: CategoryRollupRow[];
  weakest_first: CategoryRollupRow[];
  radar: {
    categories: string[];
    series: Array<{ key: string; label: string; values: (number | null)[] }>;
  };
}

interface DeptEntry {
  department: string | null;
  student_count: number;
  avg_latest_score: number | null;
  avg_first_score: number | null;
  avg_delta: number | null;
  diverging_from_institution: number | null;
  readiness_tier_counts: Record<string, number>;
  at_risk_count: number;
  weakest_category: string | null;
  weakest_category_label: string | null;
  weakest_category_score: number | null;
}
interface DepartmentComparisonData {
  departments: DeptEntry[];
  diverging: {
    institution_avg_latest_score: number | null;
    departments: (string | null)[];
    values: (number | null)[];
  };
}

interface RiskEntry {
  user_id: string;
  full_name: string;
  department: string | null;
  graduation_year: number | null;
  latest_score: number | null;
  delta: number | null;
  session_count: number;
  readiness_tier: string;
  at_risk_of_zero_offers: boolean;
  risk_reasons: string[];
}
interface RiskRosterData { roster: RiskEntry[]; }

interface GrowthHeatmapData {
  rows: (string | null)[];
  row_label: string;
  categories: string[];
  matrix: (number | null)[][];
}

// Activity: Record<YYYY-MM-DD, session_count>
type CohortActivityData = Record<string, number>;

interface SankeyNode { id: string; label: string; color?: string; }
interface SankeyLink { source: string; target: string; value: number; }
interface RoleFitData { nodes: SankeyNode[]; links: SankeyLink[]; }

// ─── Tab definition ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'skills', label: 'Skill Gaps' },
  { id: 'risk', label: 'Risk Roster' },
  { id: 'engagement', label: 'Engagement' },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Tier display constants ───────────────────────────────────────────────────
const TIER_HEX: Record<string, string> = {
  green: '#10b981',
  yellow: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  gray: '#475569',
};
const TIER_BG: Record<string, string> = {
  green: 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30',
  yellow: 'bg-amber-500/20   text-amber-400   ring-amber-500/30',
  orange: 'bg-orange-500/20  text-orange-400  ring-orange-500/30',
  red: 'bg-rose-500/20    text-rose-400    ring-rose-500/30',
  gray: 'bg-slate-500/20   text-slate-400   ring-slate-500/30',
};

// ─── SECURITY UTILITIES (SEC-1 → SEC-10 preserved; SEC-11, SEC-12 added) ─────

// SEC-1 — CSV formula injection prevention (CWE-1236)
const CSV_FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
function sanitizeCSVCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const safe = CSV_FORMULA_TRIGGERS.test(str) ? `\t${str}` : str;
  return safe.replace(/"/g, '""');
}

// SEC-2 — UTF-8 BOM for correct Excel encoding of regional-language names
const CSV_UTF8_BOM = '\uFEFF';

function buildCSV(
  data: AnalyticsData,
  accessRatePct: string,
  readiness?: CohortReadinessData | null,
  rollups?: CategoryRollupsData | null,
  risk?: RiskRosterData | null,
  depts?: DepartmentComparisonData | null,
): string {
  const ts = new Date().toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const row = (...cols: (string | number | null | undefined)[]) =>
    cols.map(c => `"${sanitizeCSVCell(c)}"`).join(',');

  const lines: string[] = [
    row('PrepVista Analytics Export'), row('Generated:', ts), '',

    // ── Plan Enrollment (existing) ──
    row('OVERVIEW'), row('Metric', 'Value'),
    row('Total Students', data.total_students),
    row('Career Access', data.career_access_students),
    row('Access Rate', accessRatePct), '',

    row('BY DEPARTMENT'), row('Department', 'Total Students', 'Career Access', 'Access Rate %'),
    ...[...(data.department_stats ?? [])].sort((a, b) => b.total - a.total).map(d => {
      const r = d.total > 0 ? Math.round((d.with_access / d.total) * 100) : 0;
      return row(d.department_name || 'Unassigned', d.total, d.with_access, `${r}%`);
    }), '',
    row('BY YEAR'), row('Year', 'Total Students', 'Career Access', 'Access Rate %'),
    ...[...(data.year_stats ?? [])].sort((a, b) => b.total - a.total).map(y => {
      const r = y.total > 0 ? Math.round((y.with_access / y.total) * 100) : 0;
      return row(y.year_name || 'Unassigned', y.total, y.with_access, `${r}%`);
    }), '',
    row('BY BATCH'), row('Batch', 'Total Students', 'Career Access', 'Access Rate %'),
    ...[...(data.batch_stats ?? [])].sort((a, b) => b.total - a.total).map(b => {
      const r = b.total > 0 ? Math.round((b.with_access / b.total) * 100) : 0;
      return row(b.batch_name || 'Unassigned', b.total, b.with_access, `${r}%`);
    }),
  ];

  // ── Readiness Summary (new) ──
  if (readiness) {
    lines.push('', row('READINESS SUMMARY'),
      row('Tier', 'Count', 'Percent'),
      ...readiness.readiness.tiers.map(t => row(t.tier, t.count, `${t.pct}%`)),
      '',
      row('SCORE DISTRIBUTION'),
      row('Scored Students', readiness.percentile.total_scored_students),
      row('Not Started', readiness.percentile.not_started_students),
      row('Mean Score', readiness.percentile.mean ?? 'N/A'),
      row('Median Score', readiness.percentile.median ?? 'N/A'),
      row('Std Dev', readiness.percentile.std_dev ?? 'N/A'),
    );
  }

  // ── Skill Gaps (new) ──
  if (rollups?.weakest_first?.length) {
    lines.push('', row('TOP SKILL GAPS (weakest first)'),
      row('Category', 'Cohort Avg (0-100)', 'Cohort Avg Delta', 'Students Scored'),
      ...rollups.weakest_first.slice(0, 10).map(c =>
        row(c.label, c.cohort_avg_latest ?? 'N/A',
          c.cohort_avg_delta != null ? `${c.cohort_avg_delta > 0 ? '+' : ''}${c.cohort_avg_delta}` : 'N/A',
          c.student_count)
      ),
    );
  }

  // ── Department Performance (new) ──
  if (depts?.departments?.length) {
    lines.push('', row('DEPARTMENT PERFORMANCE'),
      row('Department', 'Avg Score', 'Avg Growth', 'vs Institution Avg', 'At Risk Count', 'Weakest Category'),
      ...depts.departments.map(d => row(
        d.department ?? 'Unassigned',
        d.avg_latest_score ?? 'N/A',
        d.avg_delta != null ? `${d.avg_delta > 0 ? '+' : ''}${d.avg_delta}` : 'N/A',
        d.diverging_from_institution != null ? `${d.diverging_from_institution > 0 ? '+' : ''}${d.diverging_from_institution}` : 'N/A',
        d.at_risk_count,
        d.weakest_category_label ?? 'N/A',
      )),
    );
  }

  // ── At-Risk Students (new — hard flags only) ──
  if (risk?.roster?.length) {
    const hardFlags = risk.roster.filter(r => r.at_risk_of_zero_offers);
    if (hardFlags.length) {
      lines.push('', row('STUDENTS AT RISK OF ZERO OFFERS'),
        row('Name', 'Department', 'Graduation Year', 'Latest Score', 'Score Change', 'Sessions', 'Reasons'),
        ...hardFlags.map(r => row(
          r.full_name, r.department ?? '', r.graduation_year ?? '',
          r.latest_score ?? 'No data',
          r.delta != null ? `${r.delta > 0 ? '+' : ''}${r.delta}` : 'N/A',
          r.session_count,
          r.risk_reasons.join(' | '),
        )),
      );
    }
  }

  return CSV_UTF8_BOM + lines.join('\n');
}

function triggerCSVDownload(content: string, filename: string) {
  const safeFilename = filename
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/[\x00-\x1f]/g, '')
    .slice(0, 100);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: safeFilename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// SEC-3 — Existing plan-enrollment payload validation
function isValidAnalyticsPayload(data: unknown): data is AnalyticsData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.total_students === 'number' && d.total_students >= 0 &&
    typeof d.career_access_students === 'number' && d.career_access_students >= 0 &&
    Array.isArray(d.department_stats) && Array.isArray(d.year_stats) && Array.isArray(d.batch_stats);
}

// SEC-11 — New cohort endpoint validators (same runtime-guard pattern as SEC-3)
function isValidCohortReadiness(d: unknown): d is CohortReadinessData {
  if (!d || typeof d !== 'object') return false;
  const r = (d as Record<string, unknown>);
  return typeof r.readiness === 'object' && typeof r.percentile === 'object' &&
    Array.isArray((r.readiness as Record<string, unknown>)?.tiers) &&
    Array.isArray((r.percentile as Record<string, unknown>)?.buckets);
}
function isValidCategoryRollups(d: unknown): d is CategoryRollupsData {
  if (!d || typeof d !== 'object') return false;
  const r = d as Record<string, unknown>;
  return Array.isArray(r.by_category) && Array.isArray(r.weakest_first);
}
function isValidDeptComparison(d: unknown): d is DepartmentComparisonData {
  if (!d || typeof d !== 'object') return false;
  const r = d as Record<string, unknown>;
  return Array.isArray(r.departments) && typeof r.diverging === 'object';
}
function isValidRiskRoster(d: unknown): d is RiskRosterData {
  if (!d || typeof d !== 'object') return false;
  return Array.isArray((d as Record<string, unknown>).roster);
}
function isValidGrowthHeatmap(d: unknown): d is GrowthHeatmapData {
  if (!d || typeof d !== 'object') return false;
  const r = d as Record<string, unknown>;
  return Array.isArray(r.rows) && Array.isArray(r.categories) && Array.isArray(r.matrix);
}
function isValidRoleFit(d: unknown): d is RoleFitData {
  if (!d || typeof d !== 'object') return false;
  const r = d as Record<string, unknown>;
  return Array.isArray(r.nodes) && Array.isArray(r.links);
}

// SEC-4 — Numeric bounds sanitization
function sanitizeStatItem(
  name: string | null | undefined, total: unknown, withAccess: unknown,
) {
  const safeName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Unassigned';
  const safeTotal = Math.max(0, Math.round(Number.isFinite(total as number) ? total as number : 0));
  const rawAccess = Math.max(0, Math.round(Number.isFinite(withAccess as number) ? withAccess as number : 0));
  return { name: safeName, total: safeTotal, access: Math.min(rawAccess, safeTotal) };
}

// SEC-5 — Error message sanitization
const SERVER_INTERNAL_PATTERNS = [
  /\bat\s+\w/, /https?:\/\/[a-z0-9._-]+\.[a-z]{2,}/i,
  /\b(column|table|relation|schema|syntax|constraint)\b/i,
  /[A-Z][a-zA-Z]+Error:/, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\/[a-z0-9_-]+(\/[a-z0-9_-]+){2,}/i,
];
function toSafeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  if (msg.length > 180 || SERVER_INTERNAL_PATTERNS.some(re => re.test(msg))) return fallback;
  return msg;
}

// SEC-6 — Auth error detection
function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('unauthorized') || msg.includes('forbidden') ||
    msg.includes('unauthenticated') || msg.includes('401') || msg.includes('403') ||
    msg.includes('session expired') || msg.includes('invalid token');
}

// SEC-7 — Drill-down URL param sanitization
const MAX_DRILL_PARAM_LEN = 200;
function safeDrillParam(name: string): string {
  return name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_DRILL_PARAM_LEN);
}

// SEC-8 — Cooldown factory
function makeCooldown(ms: number) {
  let last = 0;
  return () => { const now = Date.now(); if (now - last < ms) return false; last = now; return true; };
}
const REFRESH_COOLDOWN_MS = 3_000;
const EXPORT_COOLDOWN_MS = 5_000;

// SEC-10 — Gradient ID whitelist (never derived from user data)
const GRADIENT_STOPS: Record<string, [string, string]> = {
  'from-blue-500 to-indigo-500': ['#3b82f6', '#6366f1'],
  'from-amber-500 to-orange-500': ['#f59e0b', '#f97316'],
  'from-cyan-500 to-teal-500': ['#06b6d4', '#14b8a6'],
};
function safeGradientId(stops: [string, string]): string {
  const [a, b] = stops.map(s => s.replace(/[^0-9a-f]/gi, ''));
  return `pv-grad-${a}-${b}`;
}

// SEC-12 — Filter param sanitization
const MAX_FILTER_DEPT_LEN = 120;
const MIN_YEAR = 1990, MAX_YEAR = 2100;
function safeDeptFilter(v: string | null): string | null {
  if (!v) return null;
  const t = v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_FILTER_DEPT_LEN);
  return t || null;
}
function safeYearFilter(v: number | null): number | null {
  if (v === null || !Number.isInteger(v)) return null;
  return (v >= MIN_YEAR && v <= MAX_YEAR) ? v : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatUpdateTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function safeArrayMax(values: number[], fallback = 1): number {
  return values.reduce((m, v) => Math.max(m, Number.isFinite(v) ? v : 0), fallback);
}
function fmtScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '–';
  return `${Math.round(score)}`;
}
function deltaLabel(delta: number | null): string {
  if (delta === null) return '–';
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
}
// Growth heatmap cell color — delta on 0-100 scale
function deltaHeatColor(delta: number | null): string {
  if (delta === null) return 'rgba(255,255,255,0.04)';
  if (delta >= 8) return '#065f46'; // strong +
  if (delta >= 3) return '#047857'; // moderate +
  if (delta >= 0) return '#0f766e'; // slight +
  if (delta >= -3) return '#9f1239'; // slight −
  return '#7f1d1d';                   // strong −
}
// Activity calendar cell color — session count intensity
function activityColor(count: number): string {
  if (count === 0) return 'rgba(255,255,255,0.05)';
  if (count <= 2) return '#064e3b';
  if (count <= 5) return '#065f46';
  if (count <= 10) return '#047857';
  return '#10b981';
}

// ─── Shimmer + Skeleton ───────────────────────────────────────────────────────
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white/[0.05] ${className}`}>
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.06) 50%,transparent 100%)',
        backgroundSize: '200% 100%', animation: 'analyticsShimmer 1.8s infinite',
      }} />
      <style>{`@keyframes analyticsShimmer{from{background-position:-200% 0}to{background-position:200% 0}}`}</style>
    </div>
  );
}
const SKELETON_CHART_ROWS = [5, 4, 6] as const;
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2"><Shimmer className="h-8 w-32" /><Shimmer className="h-4 w-60" /></div>
        <div className="flex gap-2"><Shimmer className="h-9 w-28 rounded-2xl" /><Shimmer className="h-9 w-28 rounded-2xl" /></div>
      </div>
      {/* Filter bar skeleton */}
      <div className="flex gap-3"><Shimmer className="h-9 w-48 rounded-2xl" /><Shimmer className="h-9 w-40 rounded-2xl" /></div>
      {/* Tab skeleton */}
      <div className="flex gap-2 border-b border-white/[0.06] pb-0">
        {TABS.map(t => <Shimmer key={t.id} className="h-9 w-24 rounded-t-xl" />)}
      </div>
      {/* 6 StatCards (3 existing + 3 new) */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-3xl ring-1 ring-white/10 p-6 space-y-3">
            <Shimmer className="h-3 w-24" /><Shimmer className="h-10 w-16" /><Shimmer className="h-3 w-36" />
          </div>
        ))}
      </div>
      {SKELETON_CHART_ROWS.map((rows, i) => (
        <div key={i} className="card !p-6 space-y-5">
          <Shimmer className="h-5 w-28" />
          {Array.from({ length: rows }).map((_, j) => (
            <div key={j} className="space-y-1.5">
              <div className="flex justify-between"><Shimmer className="h-4 w-28" /><Shimmer className="h-4 w-24" /></div>
              <div className="flex items-center gap-2"><Shimmer className="h-4 flex-1 rounded-full" /><Shimmer className="h-3 w-8 rounded-full" /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Recharts custom tooltip (preserved) ─────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const access = payload.find(p => p.dataKey === 'access')?.value ?? 0;
  const remainder = payload.find(p => p.dataKey === 'remainder')?.value ?? 0;
  const total = access + remainder;
  const rate = total > 0 ? Math.round((access / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2.5 shadow-xl backdrop-blur-sm text-left">
      <p className="text-xs font-semibold text-white mb-1.5 truncate max-w-[180px]">{label}</p>
      <p className="text-xs text-slate-400">{total} total students</p>
      <p className="text-xs text-emerald-400 mt-0.5">{access} with career access ({rate}%)</p>
    </div>
  );
}

// ─── Trend badge (preserved) ─────────────────────────────────────────────────
function TrendBadge({ trend }: { trend: number }) {
  if (!Number.isFinite(trend)) return null;
  const up = trend >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(Math.round(trend))} this month
    </span>
  );
}

// ─── StatCard (preserved) ─────────────────────────────────────────────────────
function StatCard({ label, value, helper, accent = 'blue', trend }: {
  label: string; value: string | number; helper: string; accent?: string; trend?: number;
}) {
  const ring: Record<string, string> = {
    blue: 'from-blue-500/20    to-blue-600/5    ring-blue-500/15',
    emerald: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15',
    violet: 'from-violet-500/20  to-violet-600/5  ring-violet-500/15',
    amber: 'from-amber-500/20   to-amber-600/5   ring-amber-500/15',
    rose: 'from-rose-500/20    to-rose-600/5    ring-rose-500/15',
    cyan: 'from-cyan-500/20    to-cyan-600/5    ring-cyan-500/15',
  };
  const text: Record<string, string> = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
    cyan: 'text-cyan-400',
  };
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${ring[accent] ?? ring.blue} p-6 ring-1 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]`}>
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/[0.03]" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-3 text-4xl font-bold tracking-tight ${text[accent] ?? text.blue}`}>{value}</div>
      <div className="mt-2 text-[13px] text-slate-500">{helper}</div>
      {trend !== undefined && <div className="mt-2"><TrendBadge trend={trend} /></div>}
    </div>
  );
}

// ─── Existing plan-enrollment BarChart (preserved exactly) ───────────────────
function BarChart({ title, items, maxVal, gradient, onRowClick }: {
  title: string;
  items: Array<{ name: string; total: number; access: number }>;
  maxVal: number; gradient: string; onRowClick?: (name: string) => void;
}) {
  if (!items.length) return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="flex items-center justify-center py-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <p className="text-sm text-slate-500">No data available for this segment.</p>
      </div>
    </div>
  );
  const stops = GRADIENT_STOPS[gradient] ?? ['#6366f1', '#3b82f6'];
  const gradId = safeGradientId(stops);
  const safeMax = Math.max(maxVal, 1);
  const chartData = items.map(item => ({ name: item.name, access: item.access, remainder: Math.max(0, item.total - item.access), total: item.total }));
  const chartHeight = Math.max(80, items.length * 56 + 20);
  const clickable = Boolean(onRowClick);
  return (
    <div className="card !p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {clickable && <span className="text-[11px] text-slate-500 hidden sm:block">Click a bar to filter students ↗</span>}
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <RechartsBarChart layout="vertical" data={chartData} margin={{ left: 0, right: 52, top: 2, bottom: 2 }} barCategoryGap="30%"
          onClick={onRowClick ? (e) => { if (e?.activeLabel) onRowClick(e.activeLabel as string); } : undefined}
          style={clickable ? { cursor: 'pointer' } : undefined}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={stops[0]} stopOpacity={0.85} />
              <stop offset="100%" stopColor={stops[1]} stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <XAxis type="number" domain={[0, safeMax]} tick={false} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={134}
            tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
            tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v}
            axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }} />
          <Bar dataKey="access" stackId="bar" fill="rgba(52,211,153,0.60)" radius={[0, 0, 0, 0]} isAnimationActive animationDuration={600} />
          <Bar dataKey="remainder" stackId="bar" fill={`url(#${gradId})`} radius={[0, 4, 4, 0]} isAnimationActive animationDuration={600}>
            <LabelList dataKey="total" position="right" style={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              formatter={(v: unknown) => String(Math.max(0, Number(v) || 0))} />
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-4 justify-end">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: `linear-gradient(90deg,${stops[0]},${stops[1]})`, opacity: 0.85 }} />No access
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="h-2.5 w-4 rounded-sm bg-emerald-400/60" />Career access
        </span>
      </div>
    </div>
  );
}

// ─── NEW: ReadinessDonut [Q1, Q2, Q6] ────────────────────────────────────────
function ReadinessDonut({ tiers, totalStudents }: {
  tiers: ReadinessTier[]; totalStudents: number;
}) {
  const scored = tiers.filter(t => t.tier !== 'Not Started').reduce((s, t) => s + t.count, 0);
  return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Readiness Breakdown</h3>
      <div className="flex flex-col sm:flex-row gap-6 items-center">
        <div className="relative shrink-0">
          <PieChart width={180} height={180}>
            <Pie data={tiers} dataKey="count" cx={90} cy={90} innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
              {tiers.map((t, i) => <Cell key={i} fill={TIER_HEX[t.color] ?? '#475569'} />)}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-white">{totalStudents}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">students</span>
          </div>
        </div>
        <div className="flex-1 w-full space-y-2">
          {tiers.map((t) => (
            <div key={t.tier} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: TIER_HEX[t.color] ?? '#475569' }} />
              <span className="flex-1 text-sm text-slate-300 truncate">{t.tier}</span>
              <span className="text-sm font-semibold text-white tabular-nums w-8 text-right">{t.count}</span>
              <span className="text-xs text-slate-500 w-10 text-right">{t.pct}%</span>
            </div>
          ))}
          <div className="pt-1 mt-1 border-t border-white/[0.06] text-xs text-slate-600">
            {scored} scored · {totalStudents - scored} not started
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NEW: CohortHistogram [Q1, Q6] ───────────────────────────────────────────
function CohortHistogram({ distribution }: { distribution: CohortReadinessData['percentile'] }) {
  const { buckets, mean, median, not_started_students } = distribution;
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div className="card !p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Score Distribution</h3>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          {mean != null && <div>Mean <span className="text-slate-300 font-medium">{mean}</span></div>}
          {median != null && <div>Median <span className="text-slate-300 font-medium">{median}</span></div>}
          {not_started_students > 0 && <div className="text-slate-600">{not_started_students} not started (excluded)</div>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <RechartsBarChart data={buckets.map(b => ({ name: `${b.range_start}–${b.range_end}`, count: b.count }))}
          margin={{ left: 0, right: 4, top: 4, bottom: 0 }} barCategoryGap="10%">
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={false} axisLine={false} tickLine={false} domain={[0, maxCount]} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs">
                  <p className="text-white font-semibold">{label}</p>
                  <p className="text-slate-400">{payload[0]?.value} students</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="count" fill="#6366f1" fillOpacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive animationDuration={500} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── NEW: ReadinessTierGrid — per-student traffic-light, paginated [Q1] ──────
function ReadinessTierGrid({ grid, onStudentClick }: {
  grid: ReadinessGridRow[];
  onStudentClick?: (userId: string) => void;
}) {
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(grid.length / PAGE_SIZE);
  const visible = grid.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!grid.length) return (
    <div className="flex items-center justify-center py-10 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <p className="text-sm text-slate-500">No student readiness data available yet.</p>
    </div>
  );

  return (
    <div className="card !p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">All Students — Readiness</h3>
        <span className="text-xs text-slate-500">{grid.length} students</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wide border-b border-white/[0.06]">
              <th className="pb-2 pr-4 font-medium">Student</th>
              <th className="pb-2 pr-4 font-medium">Department</th>
              <th className="pb-2 pr-4 font-medium">Tier</th>
              <th className="pb-2 pr-4 font-medium text-right">Score</th>
              <th className="pb-2 font-medium text-right">Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {visible.map((row) => (
              <tr key={row.user_id}
                className={`group ${onStudentClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
                onClick={() => onStudentClick?.(row.user_id)}>
                <td className="py-2.5 pr-4 text-slate-200 font-medium truncate max-w-[140px]">{row.full_name}</td>
                <td className="py-2.5 pr-4 text-slate-400 text-xs truncate max-w-[120px]">{row.department ?? '–'}</td>
                <td className="py-2.5 pr-4">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${TIER_BG[row.readiness_color] ?? TIER_BG.gray}`}>
                    {row.readiness_tier}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-slate-300">{fmtScore(row.latest_score)}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-500">{row.session_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="text-xs text-slate-400 disabled:opacity-30 hover:text-white transition-colors">← Prev</button>
          <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            className="text-xs text-slate-400 disabled:opacity-30 hover:text-white transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── NEW: SkillGapRanking [Q3, Q6] ───────────────────────────────────────────
function SkillGapRanking({ weakestFirst }: { weakestFirst: CategoryRollupRow[] }) {
  const withData = weakestFirst.filter(r => r.cohort_avg_latest !== null);
  if (!withData.length) return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Skill Gap Ranking</h3>
      <p className="text-sm text-slate-500 py-6 text-center">No category data available yet.</p>
    </div>
  );
  const maxScore = 100;
  return (
    <div className="card !p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white">Skill Gap Ranking</h3>
        <span className="text-[11px] text-slate-500">Weakest first · 0–100 scale</span>
      </div>
      <div className="space-y-3">
        {withData.map((cat, i) => {
          const score = cat.cohort_avg_latest!;
          const pct = (score / maxScore) * 100;
          const color = score >= 75 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : score >= 45 ? 'bg-orange-500' : 'bg-rose-500';
          return (
            <div key={cat.category}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-600 w-4 tabular-nums">{i + 1}</span>
                  <span className="text-sm text-slate-300 font-medium">{cat.label}</span>
                  <span className="text-[10px] text-slate-600">{cat.student_count} students</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {cat.cohort_avg_delta !== null && (
                    <span className={`text-[11px] font-semibold ${cat.cohort_avg_delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {deltaLabel(cat.cohort_avg_delta)}
                    </span>
                  )}
                  <span className="text-sm font-bold text-white tabular-nums w-8 text-right">{Math.round(score)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NEW: DeptDivergingList [Q2, Q6] ─────────────────────────────────────────
function DeptDivergingList({ data }: { data: DepartmentComparisonData }) {
  const { departments, diverging } = data;
  if (!departments.length) return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Department Performance</h3>
      <p className="text-sm text-slate-500 py-6 text-center">No department data available yet.</p>
    </div>
  );
  const maxAbs = Math.max(...(diverging.values.filter(v => v !== null) as number[]).map(Math.abs), 1);
  return (
    <div className="card !p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white">Department Performance</h3>
        {diverging.institution_avg_latest_score != null && (
          <span className="text-xs text-slate-500">Institution avg: <span className="text-slate-300 font-semibold">{Math.round(diverging.institution_avg_latest_score)}</span></span>
        )}
      </div>
      <div className="space-y-4">
        {departments.map((dept) => {
          const div = dept.diverging_from_institution;
          const pct = div !== null ? (Math.abs(div) / maxAbs) * 48 : 0;
          const isPos = (div ?? 0) >= 0;
          return (
            <div key={dept.department ?? 'none'}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-slate-300 font-medium truncate max-w-[180px]">{dept.department ?? 'Unassigned'}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {dept.weakest_category_label && (
                    <span className="text-[10px] text-slate-600 hidden sm:block">↓ {dept.weakest_category_label}</span>
                  )}
                  <span className="text-xs font-semibold text-white tabular-nums">{fmtScore(dept.avg_latest_score)}</span>
                  {div !== null && (
                    <span className={`text-xs font-semibold tabular-nums ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {deltaLabel(div)}
                    </span>
                  )}
                </div>
              </div>
              {/* Diverging bar — zero-centered */}
              <div className="relative flex items-center h-2 rounded-full bg-white/[0.05]">
                <div className="absolute left-1/2 w-px h-full bg-white/20" />
                {div !== null && (
                  <div
                    className={`absolute h-full rounded-full ${isPos ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                    style={{
                      width: `${pct}%`,
                      left: isPos ? '50%' : `calc(50% - ${pct}%)`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NEW: GrowthHeatmapGrid [Q4, Q2] ─────────────────────────────────────────
function GrowthHeatmapGrid({ heatmap }: { heatmap: GrowthHeatmapData }) {
  const { rows, categories, matrix } = heatmap;
  if (!rows.length) return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Growth Heatmap</h3>
      <p className="text-sm text-slate-500 py-6 text-center">No growth data available yet.</p>
    </div>
  );
  return (
    <div className="card !p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Growth Heatmap</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-900" />Declining</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(255,255,255,0.05)' }} />No data</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-800" />Improving</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Category column headers */}
          <div className="flex gap-px mb-1 ml-[100px]">
            {categories.map((cat, ci) => (
              <div key={ci} className="w-[28px] shrink-0" title={cat}>
                <span className="block text-[8px] text-slate-600 truncate" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 52 }}>
                  {cat.length > 10 ? cat.slice(0, 9) + '…' : cat}
                </span>
              </div>
            ))}
          </div>
          {/* Rows */}
          {rows.map((rowLabel, ri) => (
            <div key={ri} className="flex items-center gap-px mb-px">
              <div className="w-[100px] shrink-0 text-[11px] text-slate-400 truncate pr-2 text-right">{rowLabel ?? 'Unassigned'}</div>
              {matrix[ri].map((delta, ci) => (
                <div key={ci} className="w-[28px] h-[20px] rounded-sm shrink-0 flex items-center justify-center"
                  style={{ background: deltaHeatColor(delta) }}
                  title={`${rowLabel ?? '?'} / ${categories[ci]}: ${delta != null ? deltaLabel(delta) : 'no data'}`}>
                  {delta !== null && (
                    <span className="text-[7px] font-bold text-white/80 tabular-nums">
                      {delta === 0 ? '0' : delta > 0 ? `+${Math.round(delta)}` : Math.round(delta)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── NEW: ActivityCalendar [Q6] ───────────────────────────────────────────────
function ActivityCalendar({ activity, days = 90 }: { activity: CohortActivityData; days?: number }) {
  const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells = useMemo(() => {
    const result: Array<{ date: string; count: number; dayOfWeek: number }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      result.push({ date: iso, count: activity[iso] ?? 0, dayOfWeek: d.getDay() });
    }
    return result;
  }, [activity, days]);

  // Group into weeks (columns)
  const weeks: typeof cells[] = [];
  let current: typeof cells = [];
  cells.forEach((cell, i) => {
    if (i === 0 && cell.dayOfWeek > 0) {
      for (let p = 0; p < cell.dayOfWeek; p++) current.push({ date: '', count: 0, dayOfWeek: p });
    }
    current.push(cell);
    if (current.length === 7) { weeks.push(current); current = []; }
  });
  if (current.length) weeks.push(current);

  const totalSessions = Object.values(activity).reduce((s, c) => s + c, 0);

  return (
    <div className="card !p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Session Engagement</h3>
        <span className="text-xs text-slate-500">{totalSessions} sessions in last {days} days</span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex gap-px min-w-[400px]">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-px mr-1">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="h-[12px] w-7 text-[9px] text-slate-600 flex items-center">{d[0]}</div>
            ))}
          </div>
          {/* Week columns */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-px">
              {week.map((cell, di) => (
                <div key={di}
                  className="h-[12px] w-[12px] rounded-[2px] shrink-0"
                  style={{ background: cell.date ? activityColor(cell.count) : 'transparent' }}
                  title={cell.date ? `${cell.date}: ${cell.count} sessions` : ''} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-600">
        <span>Less</span>
        {[0, 2, 5, 10, 11].map(c => (
          <span key={c} className="h-2.5 w-2.5 rounded-sm" style={{ background: activityColor(c) }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ─── NEW: RoleFitFlowTable [Q1, Q6] ──────────────────────────────────────────
function RoleFitFlowTable({ nodes, links }: RoleFitData) {
  const roles = useMemo(() =>
    nodes.filter(n => n.id.startsWith('role:')).map(n => ({ id: n.id, label: n.label })),
    [nodes]);
  const tierNodes = useMemo(() =>
    nodes.filter(n => n.id.startsWith('tier:')).map(n => ({ id: n.id, label: n.label, color: n.color })),
    [nodes]);

  if (!roles.length || !tierNodes.length) return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Role Fit Distribution</h3>
      <p className="text-sm text-slate-500 py-6 text-center">No role-fit data available yet. Students need at least one completed interview with a target role set.</p>
    </div>
  );

  const getCount = (roleId: string, tierId: string) =>
    links.find(l => l.source === roleId && l.target === tierId)?.value ?? 0;

  return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Role Fit Distribution</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wide border-b border-white/[0.06]">
              <th className="pb-2 pr-6 font-medium">Target Role</th>
              {tierNodes.map(t => (
                <th key={t.id} className="pb-2 pr-4 font-medium text-right">
                  <span className="flex items-center justify-end gap-1">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: TIER_HEX[t.color ?? 'gray'] ?? '#475569' }} />
                    {t.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {roles.map(role => {
              const total = tierNodes.reduce((s, t) => s + getCount(role.id, t.id), 0);
              return (
                <tr key={role.id}>
                  <td className="py-3 pr-6 text-slate-200 font-medium">{role.label}</td>
                  {tierNodes.map(t => {
                    const count = getCount(role.id, t.id);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <td key={t.id} className="py-3 pr-4 text-right">
                        {count > 0 ? (
                          <span className="inline-flex flex-col items-end">
                            <span className="text-white font-semibold tabular-nums">{count}</span>
                            <span className="text-[10px] text-slate-600">{pct}%</span>
                          </span>
                        ) : <span className="text-slate-700">–</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── NEW: StudentRiskTable [Q5, Q6] ──────────────────────────────────────────
function StudentRiskTable({ roster, onStudentClick }: {
  roster: RiskEntry[];
  onStudentClick?: (userId: string) => void;
}) {
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [hardOnly, setHardOnly] = useState(false);

  const filtered = useMemo(() => hardOnly ? roster.filter(r => r.at_risk_of_zero_offers) : roster, [roster, hardOnly]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const hardCount = roster.filter(r => r.at_risk_of_zero_offers).length;

  if (!roster.length) return (
    <div className="card !p-6">
      <h3 className="text-lg font-semibold text-white mb-4">At-Risk Students</h3>
      <div className="flex items-center justify-center py-10 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <div className="text-center">
          <p className="text-sm text-slate-400 font-medium">No students flagged at risk.</p>
          <p className="text-xs text-slate-600 mt-1">Students appear here when they score in the At Risk band or have not started any interviews.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="card !p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-white">At-Risk Students</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="text-rose-400 font-semibold">{hardCount}</span> urgent · <span className="text-amber-400 font-semibold">{roster.length - hardCount}</span> watching
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <input type="checkbox" checked={hardOnly} onChange={e => { setHardOnly(e.target.checked); setPage(0); }}
            className="rounded border-white/20 bg-white/5 text-rose-500 focus:ring-rose-500/50" />
          <span className="text-xs text-slate-400">Urgent only</span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wide border-b border-white/[0.06]">
              <th className="pb-2 pr-3 font-medium">Student</th>
              <th className="pb-2 pr-3 font-medium">Dept</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium text-right">Score</th>
              <th className="pb-2 pr-3 font-medium text-right">Change</th>
              <th className="pb-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {visible.map(r => (
              <tr key={r.user_id}
                className={onStudentClick ? 'cursor-pointer hover:bg-white/[0.025] transition-colors' : ''}
                onClick={() => onStudentClick?.(r.user_id)}>
                <td className="py-3 pr-3 font-medium text-slate-200 max-w-[130px] truncate">{r.full_name}</td>
                <td className="py-3 pr-3 text-slate-500 text-xs max-w-[100px] truncate">{r.department ?? '–'}</td>
                <td className="py-3 pr-3">
                  {r.at_risk_of_zero_offers
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />Urgent</span>
                    : <span className="text-[10px] font-semibold text-amber-500">Watch</span>}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums text-slate-300">{fmtScore(r.latest_score)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">
                  <span className={r.delta == null ? 'text-slate-600' : r.delta >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                    {deltaLabel(r.delta)}
                  </span>
                </td>
                <td className="py-3 text-xs text-slate-500 max-w-[220px]">
                  {r.risk_reasons[0] ?? '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="text-xs text-slate-400 disabled:opacity-30 hover:text-white transition-colors">← Prev</button>
          <span className="text-xs text-slate-500">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            className="text-xs text-slate-400 disabled:opacity-30 hover:text-white transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── NEW: SectionLoader — unified loading / error / empty state ───────────────
function SectionLoader({ loading, error, empty, emptyMsg, children }: {
  loading: boolean; error: unknown; empty: boolean; emptyMsg?: string; children: React.ReactNode;
}) {
  if (loading) return (
    <div className="space-y-4">
      {[1, 2].map(i => <Shimmer key={i} className="h-56 w-full rounded-2xl" />)}
    </div>
  );
  if (error) return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
      {toSafeError(error, 'Failed to load this section. Please refresh.')}
    </div>
  );
  if (empty) return (
    <div className="flex items-center justify-center py-12 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <p className="text-sm text-slate-500">{emptyMsg ?? 'No data available yet.'}</p>
    </div>
  );
  return <>{children}</>;
}

// ─── PAGE COMPONENT ───────────────────────────────────────────────────────────
// NOTE FOR @/lib/api.ts — add these typed methods to the api client:
//   getCohortDistribution<T>(params?: { department?: string; year?: number }): Promise<T>
//   getCohortRollups<T>(params?: { department?: string; year?: number }): Promise<T>
//   getCohortDepartments<T>(params?: { year?: number }): Promise<T>
//   getCohortRiskRoster<T>(params?: { department?: string; year?: number }): Promise<T>
//   getCohortGrowthHeatmap<T>(params?: { department?: string; year?: number }): Promise<T>
//   getCohortActivity<T>(params?: { department?: string; year?: number; days?: number }): Promise<T>
//   getCohortRoleFit<T>(params?: { department?: string; year?: number }): Promise<T>

const SWR_BASE_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 120_000,
  errorRetryCount: 2,
  shouldRetryOnError: true,
} as const;

export default function CollegeAnalyticsPage() {
  const router = useRouter();

  // ── UI state ────────────────────────────────────────────────────────────────
  const params = useParams();
  const slug = params?.slug;
  const tabName = Array.isArray(slug) ? slug[0] : slug;
  
  const initialTab: TabId = 
    tabName === 'performance' ? 'skills' :
    tabName === 'growth' ? 'engagement' :
    tabName === 'readiness' ? 'readiness' :
    'overview';

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const pSlug = params?.slug;
    const tName = Array.isArray(pSlug) ? pSlug[0] : pSlug;
    if (tName === 'performance') setActiveTab('skills');
    else if (tName === 'growth') setActiveTab('engagement');
    else if (tName === 'readiness') setActiveTab('readiness');
    else setActiveTab('overview');
  }, [params?.slug]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [authRedirected, setAuthRedirected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // SEC-8 — cooldowns
  const canRefresh = useRef(makeCooldown(REFRESH_COOLDOWN_MS));
  const canExport = useRef(makeCooldown(EXPORT_COOLDOWN_MS));

  // SEC-12 — sanitized filter key (safe for SWR keys and URL encoding)
  const filterKey = useMemo(() => {
    const dept = safeDeptFilter(activeDept);
    const year = safeYearFilter(activeYear);
    return `d=${encodeURIComponent(dept ?? '')}&y=${year ?? ''}`;
  }, [activeDept, activeYear]);

  // Lazy SWR keys — null = don't fetch yet
  const isSkillsTab = activeTab === 'skills';
  const isOverviewOrSkills = activeTab === 'overview' || activeTab === 'skills';
  const isRiskTab = activeTab === 'risk';
  const isEngageTab = activeTab === 'engagement';

  const rollupsKey = isSkillsTab ? `cohort-rollups|${filterKey}` : null;
  const deptsKey = isOverviewOrSkills ? `cohort-depts|${filterKey}` : null;
  const riskKey = isRiskTab ? `cohort-risk|${filterKey}` : null;
  const heatmapKey = isSkillsTab ? `cohort-heatmap|${filterKey}` : null;
  const activityKey = isEngageTab ? `cohort-activity|${filterKey}` : null;
  const roleFitKey = isEngageTab ? `cohort-rolefit|${filterKey}` : null;

  // ── Auth / error handler ────────────────────────────────────────────────────
  const handleSWRError = useCallback((err: unknown) => {
    if (isAuthError(err) && !authRedirected) {
      setAuthRedirected(true);
      router.push('/login');
      return;
    }
    setDisplayError(toSafeError(err, 'Failed to load analytics data. Please refresh.'));
  }, [router, authRedirected]);

  // ── SWR 1: Plan-enrollment (existing, preserved) ───────────────────────────
  const {
    data, error: enrollmentError, isLoading, mutate,
  } = useSWR(
    'college-analytics',
    async () => {
      const res = await api.getCollegeAnalytics<AnalyticsData>();
      // SEC-3: shape validation
      if (!isValidAnalyticsPayload(res)) throw new Error('Invalid analytics data received from server.');
      // SEC-4: numeric bounds
      res.total_students = Math.max(0, Math.round(Number.isFinite(res.total_students) ? res.total_students : 0));
      res.career_access_students = Math.max(0, Math.round(Number.isFinite(res.career_access_students) ? res.career_access_students : 0));
      res.department_stats = (res.department_stats ?? []).filter(d => d && typeof d.department_name === 'string');
      res.year_stats = (res.year_stats ?? []).filter(y => y && typeof y.year_name === 'string');
      res.batch_stats = (res.batch_stats ?? []).filter(b => b && typeof b.batch_name === 'string');
      return res;
    },
    { ...SWR_BASE_OPTIONS, onError: handleSWRError },
  );

  // ── SWR 2: Cohort readiness (always loaded — powers Overview StatCards) ─────
  const {
    data: readinessData, isLoading: readinessLoading, error: readinessError, mutate: mutateReadiness,
  } = useSWR(
    `cohort-readiness|${filterKey}`,
    async () => {
      const res = await api.getCohortDistribution<CohortReadinessData>({
        department: safeDeptFilter(activeDept) ?? undefined,
        year: safeYearFilter(activeYear) ?? undefined,
      });
      // SEC-11: shape validation
      if (!isValidCohortReadiness(res)) throw new Error('Invalid readiness data received from server.');
      return res;
    },
    SWR_BASE_OPTIONS,
  );

  // ── SWR 3: Category rollups (lazy — Skills tab) ────────────────────────────
  const {
    data: rollupsData, isLoading: rollupsLoading, error: rollupsError, mutate: mutateRollups,
  } = useSWR(
    rollupsKey,
    async () => {
      const res = await api.getCohortRollups<CategoryRollupsData>({
        department: safeDeptFilter(activeDept) ?? undefined,
        year: safeYearFilter(activeYear) ?? undefined,
      });
      if (!isValidCategoryRollups(res)) throw new Error('Invalid category rollups data received from server.');
      return res;
    },
    SWR_BASE_OPTIONS,
  );

  // ── SWR 4: Department comparison (lazy — Overview + Skills tabs) ───────────
  const {
    data: deptsData, isLoading: deptsLoading, error: deptsError, mutate: mutateDepts,
  } = useSWR(
    deptsKey,
    async () => {
      const res = await api.getCohortDepartments<DepartmentComparisonData>({
        year: safeYearFilter(activeYear) ?? undefined,
      });
      if (!isValidDeptComparison(res)) throw new Error('Invalid department comparison data received from server.');
      return res;
    },
    SWR_BASE_OPTIONS,
  );

  // ── SWR 5: Risk roster (lazy — Risk tab) ───────────────────────────────────
  const {
    data: riskData, isLoading: riskLoading, error: riskError, mutate: mutateRisk,
  } = useSWR(
    riskKey,
    async () => {
      const res = await api.getCohortRiskRoster<RiskRosterData>({
        department: safeDeptFilter(activeDept) ?? undefined,
        year: safeYearFilter(activeYear) ?? undefined,
      });
      if (!isValidRiskRoster(res)) throw new Error('Invalid risk roster data received from server.');
      return res;
    },
    SWR_BASE_OPTIONS,
  );

  // ── SWR 6: Growth heatmap (lazy — Skills tab) ──────────────────────────────
  const {
    data: heatmapData, isLoading: heatmapLoading, error: heatmapError, mutate: mutateHeatmap,
  } = useSWR(
    heatmapKey,
    async () => {
      const res = await api.getCohortGrowthHeatmap<GrowthHeatmapData>({
        department: safeDeptFilter(activeDept) ?? undefined,
        year: safeYearFilter(activeYear) ?? undefined,
      });
      if (!isValidGrowthHeatmap(res)) throw new Error('Invalid growth heatmap data received from server.');
      return res;
    },
    SWR_BASE_OPTIONS,
  );

  // ── SWR 7: Activity calendar (lazy — Engagement tab) ──────────────────────
  const {
    data: activityData, isLoading: activityLoading, error: activityError, mutate: mutateActivity,
  } = useSWR(
    activityKey,
    async () => {
      const res = await api.getCohortActivity<CohortActivityData>({
        department: safeDeptFilter(activeDept) ?? undefined,
        year: safeYearFilter(activeYear) ?? undefined,
        days: 90,
      });
      if (!res || typeof res !== 'object' || Array.isArray(res))
        throw new Error('Invalid activity data received from server.');
      // SEC-11: ensure all values are non-negative integers
      const safe: CohortActivityData = {};
      for (const [k, v] of Object.entries(res)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v))
          safe[k] = Math.max(0, Math.round(v));
      }
      return safe;
    },
    SWR_BASE_OPTIONS,
  );

  // ── SWR 8: Role-fit flow (lazy — Engagement tab) ──────────────────────────
  const {
    data: roleFitData, isLoading: roleFitLoading, error: roleFitError, mutate: mutateRoleFit,
  } = useSWR(
    roleFitKey,
    async () => {
      const res = await api.getCohortRoleFit<RoleFitData>({
        department: safeDeptFilter(activeDept) ?? undefined,
        year: safeYearFilter(activeYear) ?? undefined,
      });
      if (!isValidRoleFit(res)) throw new Error('Invalid role-fit data received from server.');
      return res;
    },
    SWR_BASE_OPTIONS,
  );

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (!canRefresh.current()) return;
    setDisplayError(null);
    setLastUpdated(new Date());
    // Refresh all currently-loaded SWR entries simultaneously
    await Promise.allSettled([
      mutate(), mutateReadiness(),
      deptsKey ? mutateDepts() : Promise.resolve(),
      rollupsKey ? mutateRollups() : Promise.resolve(),
      riskKey ? mutateRisk() : Promise.resolve(),
      heatmapKey ? mutateHeatmap() : Promise.resolve(),
      activityKey ? mutateActivity() : Promise.resolve(),
      roleFitKey ? mutateRoleFit() : Promise.resolve(),
    ]);
  }, [
    mutate, mutateReadiness, mutateDepts, mutateRollups,
    mutateRisk, mutateHeatmap, mutateActivity, mutateRoleFit,
    deptsKey, rollupsKey, riskKey, heatmapKey, activityKey, roleFitKey,
  ]);

  const handleExport = useCallback(() => {
    if (!data || !canExport.current()) return;
    const safeTotal = Math.max(0, data.total_students);
    const safeAccess = Math.min(Math.max(0, data.career_access_students), safeTotal);
    const accessRatePct = safeTotal > 0 ? `${Math.round((safeAccess / safeTotal) * 100)}%` : '0%';
    const csvContent = buildCSV(data, accessRatePct, readinessData, rollupsData, riskData, deptsData);
    const dateStr = new Date().toISOString().slice(0, 10);
    const deptSuffix = activeDept ? `-${activeDept.replace(/[^a-z0-9]/gi, '-').toLowerCase()}` : '';
    triggerCSVDownload(csvContent, `prepvista-analytics-${dateStr}${deptSuffix}.csv`);
  }, [data, readinessData, rollupsData, riskData, deptsData, activeDept]);

  // SEC-7: drill-down handlers
  const handleDeptClick = useCallback((name: string) =>
    router.push(`/org-admin/students?department=${encodeURIComponent(safeDrillParam(name))}`), [router]);
  const handleStudentClick = useCallback((userId: string) =>
    router.push(`/org-admin/students/${encodeURIComponent(safeDrillParam(userId))}`), [router]);

  // Filter clear with tab reset to overview
  const handleClearFilters = useCallback(() => {
    setActiveDept(null);
    setActiveYear(null);
    setActiveTab('overview');
  }, []);

  // ── Derived display values ──────────────────────────────────────────────────
  const safeTotal = Math.max(0, data?.total_students ?? 0);
  const safeAccess = Math.min(Math.max(0, data?.career_access_students ?? 0), safeTotal);
  const accessRatePct = safeTotal > 0 ? `${Math.round((safeAccess / safeTotal) * 100)}%` : '—';

  const readyCount = readinessData?.readiness.tiers.find(t => t.tier === 'Ready')?.count;
  const atRiskCount = (readinessData?.readiness.tiers.find(t => t.tier === 'At Risk')?.count ?? 0)
    + (readinessData?.readiness.tiers.find(t => t.tier === 'Not Started')?.count ?? 0);
  const avgScore = readinessData?.percentile.mean;
  // Hard risk badge on tab — only show if risk tab data is loaded
  const hardRiskBadge = riskData?.roster.filter(r => r.at_risk_of_zero_offers).length;

  // SEC-9: prototype-safe stat processing
  const deptItems = useMemo(() =>
    (data?.department_stats ?? [])
      .filter(d => d && Object.prototype.hasOwnProperty.call(d, 'department_name'))
      .map(d => {
        const s = sanitizeStatItem(d.department_name, d.total, d.with_access);
        return { name: s.name, total: s.total, access: s.access };
      })
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15),
    [data?.department_stats],
  );
  const yearItems = useMemo(() =>
    (data?.year_stats ?? [])
      .filter(y => y && Object.prototype.hasOwnProperty.call(y, 'year_name'))
      .map(y => {
        const s = sanitizeStatItem(y.year_name, y.total, y.with_access);
        return { name: s.name, total: s.total, access: s.access };
      })
      .filter(y => y.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12),
    [data?.year_stats],
  );
  const batchItems = useMemo(() =>
    (data?.batch_stats ?? [])
      .filter(b => b && Object.prototype.hasOwnProperty.call(b, 'batch_name'))
      .map(b => {
        const s = sanitizeStatItem(b.batch_name, b.total, b.with_access);
        return { name: s.name, total: s.total, access: s.access };
      })
      .filter(b => b.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12),
    [data?.batch_stats],
  );

  const deptMax = safeArrayMax(deptItems.map(d => d.total));
  const yearMax = safeArrayMax(yearItems.map(y => y.total));
  const batchMax = safeArrayMax(batchItems.map(b => b.total));

  // Filter dropdowns populated from plan-enrollment data (always loaded, no extra fetch)
  const DEPT_OPTIONS = useMemo(() =>
    [...new Set(deptItems.map(d => d.name))].sort(),
    [deptItems],
  );
  const YEAR_OPTIONS = useMemo(() => {
    const years = (data?.year_stats ?? [])
      .map(y => parseInt(String(y.year_name)))
      .filter(y => !isNaN(y) && y >= MIN_YEAR && y <= MAX_YEAR);
    return [...new Set(years)].sort((a, b) => a - b);
  }, [data?.year_stats]);

  // ── Error display consolidation ─────────────────────────────────────────────
  const activeDisplayError = displayError
    ?? (enrollmentError ? toSafeError(enrollmentError, 'Failed to load enrollment data. Please refresh.') : null);

  // ── Initial skeleton (plan-enrollment not yet loaded) ──────────────────────
  if (!data && isLoading) return <AnalyticsSkeleton />;

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Updated {formatUpdateTime(lastUpdated)}
            {(activeDept || activeYear) && (
              <span className="text-slate-600"> · {[activeDept, activeYear].filter(Boolean).join(', ')}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white active:scale-95">
            ↻ Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!data}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-medium text-indigo-300 transition-all hover:bg-indigo-500/20 hover:text-indigo-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none">
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── Filter bar (SEC-12) ── */}
      {(DEPT_OPTIONS.length > 0 || YEAR_OPTIONS.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {DEPT_OPTIONS.length > 0 && (
            <select
              value={activeDept ?? ''}
              onChange={e => {
                // SEC-12: sanitize before storing
                setActiveDept(safeDeptFilter(e.target.value) ?? null);
                setActiveTab('overview');
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 cursor-pointer">
              <option value="">All Departments</option>
              {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {YEAR_OPTIONS.length > 0 && (
            <select
              value={activeYear ?? ''}
              onChange={e => {
                const parsed = parseInt(e.target.value);
                // SEC-12: range-check before storing
                setActiveYear(safeYearFilter(isNaN(parsed) ? null : parsed));
                setActiveTab('overview');
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 cursor-pointer">
              <option value="">All Years</option>
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {(activeDept || activeYear) && (
            <button
              onClick={handleClearFilters}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              × Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Error banner ── */}
      {activeDisplayError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3">
          <span className="text-rose-400 shrink-0 mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-rose-300">{activeDisplayError}</p>
          </div>
          <button onClick={() => setDisplayError(null)} className="text-rose-500 hover:text-rose-300 text-xs shrink-0">✕</button>
        </div>
      )}

      {/* ── 6 StatCards: 3 plan-enrollment (existing) + 3 readiness (new) ── */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Students" accent="blue"
          value={safeTotal.toLocaleString('en-IN')}
          helper="Enrolled in your institution"
          trend={data?.total_students_trend} />
        <StatCard
          label="Career Access" accent="emerald"
          value={safeAccess.toLocaleString('en-IN')}
          helper="Students with career plan"
          trend={data?.career_access_trend} />
        <StatCard
          label="Access Rate" accent="violet"
          value={accessRatePct}
          helper="Career plan adoption"
          trend={data?.access_rate_trend} />
        {readinessData ? (
          <>
            <StatCard
              label="Avg Readiness Score" accent="cyan"
              value={avgScore != null ? `${Math.round(avgScore)}/100` : '–'}
              helper="Cohort average (scored students only)" />
            <StatCard
              label="Placement Ready" accent="emerald"
              value={readyCount != null ? readyCount.toLocaleString('en-IN') : '–'}
              helper="Students scoring ≥ 75 / 100" />
            <StatCard
              label="Need Attention" accent="rose"
              value={atRiskCount.toLocaleString('en-IN')}
              helper={`At Risk + Not Started${activeDisplayError ? '' : ''}`} />
          </>
        ) : readinessLoading ? (
          [0, 1, 2].map(i => <Shimmer key={i} className="h-[134px] rounded-3xl" />)
        ) : null}
      </div>

      {/* ── Tab navigation ── */}
      <div className="border-b border-white/[0.06]">
        <div className="flex -mb-px overflow-x-auto gap-1 scrollbar-none">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const badge = tab.id === 'risk' && hardRiskBadge != null && hardRiskBadge > 0
              ? hardRiskBadge
              : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 whitespace-nowrap ${isActive
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-white/20'
                  }`}>
                {tab.label}
                {badge != null && (
                  <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-rose-500/25 text-rose-400 text-[9px] font-bold ring-1 ring-rose-500/30">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Overview — plan-enrollment charts (existing) + dept diverging    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <BarChart
            title="By Department"
            items={deptItems} maxVal={deptMax}
            gradient="from-blue-500 to-indigo-500"
            onRowClick={handleDeptClick} />
          <BarChart
            title="By Graduation Year"
            items={yearItems} maxVal={yearMax}
            gradient="from-amber-500 to-orange-500" />
          <BarChart
            title="By Batch"
            items={batchItems} maxVal={batchMax}
            gradient="from-cyan-500 to-teal-500" />
          {/* Department performance comparison (lazy — loads once Overview is active) */}
          {deptsLoading && <Shimmer className="h-56 w-full rounded-2xl" />}
          {deptsError && (
            <p className="text-xs text-rose-400 px-1">
              Could not load department performance: {toSafeError(deptsError, 'please refresh.')}
            </p>
          )}
          {deptsData && <DeptDivergingList data={deptsData} />}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Readiness — donut, histogram, per-student traffic-light grid     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'readiness' && (
        <SectionLoader
          loading={readinessLoading}
          error={readinessError}
          empty={!readinessData}
          emptyMsg="Readiness data will appear once students complete their first graded interview.">
          {readinessData && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <ReadinessDonut
                  tiers={readinessData.readiness.tiers}
                  totalStudents={readinessData.readiness.total_students} />
                <CohortHistogram distribution={readinessData.percentile} />
              </div>
              <ReadinessTierGrid
                grid={readinessData.readiness.grid}
                onStudentClick={handleStudentClick} />
            </div>
          )}
        </SectionLoader>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Skill Gaps — weakest category ranking + growth heatmap           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'skills' && (
        <SectionLoader
          loading={rollupsLoading}
          error={rollupsError}
          empty={!rollupsData}
          emptyMsg="Skill gap data will appear once students complete interviews with category-level scores.">
          {rollupsData && (
            <div className="space-y-5">
              <SkillGapRanking weakestFirst={rollupsData.weakest_first} />
              {heatmapLoading && <Shimmer className="h-64 w-full rounded-2xl" />}
              {heatmapError && (
                <p className="text-xs text-rose-400 px-1">
                  Could not load growth heatmap: {toSafeError(heatmapError, 'please refresh.')}
                </p>
              )}
              {heatmapData && <GrowthHeatmapGrid heatmap={heatmapData} />}
            </div>
          )}
        </SectionLoader>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Risk Roster — students at risk of zero placement offers           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'risk' && (
        <SectionLoader
          loading={riskLoading}
          error={riskError}
          empty={!riskData}
          emptyMsg="Risk roster will appear once students have completed interviews.">
          {riskData && (
            <StudentRiskTable
              roster={riskData.roster}
              onStudentClick={handleStudentClick} />
          )}
        </SectionLoader>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Engagement — session activity calendar + role-fit distribution   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'engagement' && (
        <SectionLoader
          loading={activityLoading || roleFitLoading}
          error={activityError ?? roleFitError}
          empty={!activityData && !roleFitData}
          emptyMsg="Engagement data will appear once students complete interviews.">
          <div className="space-y-5">
            {activityData && (
              <ActivityCalendar activity={activityData} days={90} />
            )}
            {roleFitLoading && !roleFitData && <Shimmer className="h-48 w-full rounded-2xl" />}
            {roleFitData && (
              <RoleFitFlowTable nodes={roleFitData.nodes} links={roleFitData.links} />
            )}
          </div>
        </SectionLoader>
      )}

    </div>
  );
}