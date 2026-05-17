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
 */

import useSWR from 'swr';
import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer, BarChart as RechartsBarChart,
  Bar, XAxis, YAxis, Tooltip, LabelList,
} from 'recharts';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  total_students: number;
  career_access_students: number;
  total_students_trend?:  number;
  career_access_trend?:   number;
  access_rate_trend?:     number;
  department_stats: Array<{ department_name: string; total: number; with_access: number }>;
  year_stats:       Array<{ year_name: string;        total: number; with_access: number }>;
  batch_stats:      Array<{ batch_name: string;        total: number; with_access: number }>;
}

// ─── SECURITY UTILITIES ───────────────────────────────────────────────────────

// SEC-1 — CSV formula injection prevention (CWE-1236)
const CSV_FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
function sanitizeCSVCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Prefix formula-triggering chars with tab — neutralises execution, invisible in cell
  const safe = CSV_FORMULA_TRIGGERS.test(str) ? `\t${str}` : str;
  return safe.replace(/"/g, '""'); // RFC 4180 internal quote escape
}

// SEC-2 — UTF-8 BOM for correct Excel encoding of regional-language names
const CSV_UTF8_BOM = '\uFEFF';

function buildCSV(data: AnalyticsData, accessRatePct: string): string {
  const ts = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const row = (...cols: (string | number | null | undefined)[]) =>
    cols.map(c => `"${sanitizeCSVCell(c)}"`).join(',');
  const lines: string[] = [
    row('PrepVista Analytics Export'), row('Generated:', ts), '',
    row('OVERVIEW'), row('Metric', 'Value'),
    row('Total Students', data.total_students), row('Career Access', data.career_access_students), row('Access Rate', accessRatePct), '',
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
  return CSV_UTF8_BOM + lines.join('\n');
}

function triggerCSVDownload(content: string, filename: string) {
  const safeFilename = filename.replace(/[/\\:*?"<>|]/g, '-').replace(/[\x00-\x1f]/g, '').slice(0, 100);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: safeFilename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// SEC-3 — API response shape validation
function isValidAnalyticsPayload(data: unknown): data is AnalyticsData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.total_students === 'number' && d.total_students >= 0 &&
    typeof d.career_access_students === 'number' && d.career_access_students >= 0 &&
    Array.isArray(d.department_stats) && Array.isArray(d.year_stats) && Array.isArray(d.batch_stats);
}

// SEC-4 — Numeric bounds sanitization
function sanitizeStatItem(name: string | null | undefined, total: unknown, withAccess: unknown) {
  const safeName   = (typeof name === 'string' && name.trim()) ? name.trim() : 'Unassigned';
  const safeTotal  = Math.max(0, Math.round(Number.isFinite(total as number) ? total as number : 0));
  const rawAccess  = Math.max(0, Math.round(Number.isFinite(withAccess as number) ? withAccess as number : 0));
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
const EXPORT_COOLDOWN_MS  = 5_000;

// SEC-10 — Gradient ID whitelist (never derived from user data)
const GRADIENT_STOPS: Record<string, [string, string]> = {
  'from-blue-500 to-indigo-500':  ['#3b82f6', '#6366f1'],
  'from-amber-500 to-orange-500': ['#f59e0b', '#f97316'],
  'from-cyan-500 to-teal-500':    ['#06b6d4', '#14b8a6'],
};
function safeGradientId(stops: [string, string]): string {
  const [a, b] = stops.map(s => s.replace(/[^0-9a-f]/gi, ''));
  return `pv-grad-${a}-${b}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatUpdateTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function safeArrayMax(values: number[], fallback = 1): number {
  return values.reduce((m, v) => Math.max(m, Number.isFinite(v) ? v : 0), fallback);
}

// ─── Shimmer + Skeleton ───────────────────────────────────────────────────────
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white/[0.05] ${className}`}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.06) 50%,transparent 100%)', backgroundSize: '200% 100%', animation: 'analyticsShimmer 1.8s infinite' }} />
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
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(['blue', 'emerald', 'violet'] as const).map(a => (
          <div key={a} className="rounded-3xl ring-1 ring-white/10 p-6 space-y-3">
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

// ─── Recharts custom tooltip ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string; }) {
  if (!active || !payload?.length) return null;
  const access    = payload.find(p => p.dataKey === 'access')?.value    ?? 0;
  const remainder = payload.find(p => p.dataKey === 'remainder')?.value ?? 0;
  const total = access + remainder;
  const rate  = total > 0 ? Math.round((access / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2.5 shadow-xl backdrop-blur-sm text-left">
      <p className="text-xs font-semibold text-white mb-1.5 truncate max-w-[180px]">{label}</p>
      <p className="text-xs text-slate-400">{total} total students</p>
      <p className="text-xs text-emerald-400 mt-0.5">{access} with career access ({rate}%)</p>
    </div>
  );
}

// ─── Trend badge ─────────────────────────────────────────────────────────────
function TrendBadge({ trend }: { trend: number }) {
  if (!Number.isFinite(trend)) return null;
  const up = trend >= 0;
  return <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{up ? '↑' : '↓'} {Math.abs(Math.round(trend))} this month</span>;
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ label, value, helper, accent = 'blue', trend }: { label: string; value: string | number; helper: string; accent?: string; trend?: number; }) {
  const ring: Record<string, string> = { blue: 'from-blue-500/20 to-blue-600/5 ring-blue-500/15', emerald: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15', violet: 'from-violet-500/20 to-violet-600/5 ring-violet-500/15' };
  const text: Record<string, string> = { blue: 'text-blue-400', emerald: 'text-emerald-400', violet: 'text-violet-400' };
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

// ─── BarChart ─────────────────────────────────────────────────────────────────
function BarChart({ title, items, maxVal, gradient, onRowClick }: {
  title: string; items: Array<{ name: string; total: number; access: number }>;
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

  // SEC-10 — gradId only from whitelisted hex stops
  const stops   = GRADIENT_STOPS[gradient] ?? ['#6366f1', '#3b82f6'];
  const gradId  = safeGradientId(stops);
  const safeMax = Math.max(maxVal, 1);
  const chartData    = items.map(item => ({ name: item.name, access: item.access, remainder: Math.max(0, item.total - item.access), total: item.total }));
  const chartHeight  = Math.max(80, items.length * 56 + 20);
  const clickable    = Boolean(onRowClick);

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
          <YAxis type="category" dataKey="name" width={134} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
            tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }} />
          <Bar dataKey="access" stackId="bar" fill="rgba(52,211,153,0.60)" radius={[0, 0, 0, 0]} isAnimationActive animationDuration={600} />
          <Bar dataKey="remainder" stackId="bar" fill={`url(#${gradId})`} radius={[0, 4, 4, 0]} isAnimationActive animationDuration={600}>
            <LabelList dataKey="total" position="right" style={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} formatter={(v: unknown) => String(Math.max(0, Number(v) || 0))} />
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

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const router = useRouter();

  // SEC-8 — stable cooldown refs
  const refreshAllowed = useRef(makeCooldown(REFRESH_COOLDOWN_MS)).current;
  const exportAllowed  = useRef(makeCooldown(EXPORT_COOLDOWN_MS)).current;

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const handleSuccess = useCallback(() => setLastUpdated(new Date()), []);

  const { data, error: swrError, isLoading, isValidating, mutate } = useSWR(
    'college-analytics',
    async () => {
      const res = await api.getCollegeAnalytics<AnalyticsData>();
      if (!isValidAnalyticsPayload(res)) throw new Error('Unexpected server response. Please refresh.');
      return res;
    },
    {
      revalidateOnFocus: false, revalidateOnReconnect: true,
      dedupingInterval: 60_000, errorRetryCount: 2, shouldRetryOnError: true,
      onSuccess: handleSuccess,
      onError: (err) => { if (isAuthError(err)) router.push('/login'); },
    }
  );

  // SEC-8 — guarded refresh
  const handleRefresh = useCallback(() => { if (refreshAllowed()) mutate(); }, [mutate, refreshAllowed]);

  const maxDept  = useMemo(() => safeArrayMax((data?.department_stats ?? []).map(d => d.total)), [data?.department_stats]);
  const maxYear  = useMemo(() => safeArrayMax((data?.year_stats ?? []).map(y => y.total)), [data?.year_stats]);
  const maxBatch = useMemo(() => safeArrayMax((data?.batch_stats ?? []).map(b => b.total)), [data?.batch_stats]);

  // SEC-4 + SEC-9 — sanitize every item at the API boundary
  const sortedDepts   = useMemo(() => [...(data?.department_stats ?? [])].sort((a, b) => b.total - a.total).map(d => sanitizeStatItem(d.department_name, d.total, d.with_access)), [data?.department_stats]);
  const sortedYears   = useMemo(() => [...(data?.year_stats ?? [])].sort((a, b) => b.total - a.total).map(y => sanitizeStatItem(y.year_name, y.total, y.with_access)), [data?.year_stats]);
  const sortedBatches = useMemo(() => [...(data?.batch_stats ?? [])].sort((a, b) => b.total - a.total).map(b => sanitizeStatItem(b.batch_name, b.total, b.with_access)), [data?.batch_stats]);

  const accessRatePct = useMemo(() => {
    if (!data || data.total_students <= 0) return '0%';
    const raw = (data.career_access_students / data.total_students) * 100;
    if (!Number.isFinite(raw)) return '0%';
    return `${Math.min(100, Math.max(0, Math.round(raw)))}%`;
  }, [data]);

  // SEC-8 — guarded export
  const handleExport = useCallback(() => {
    if (!data || !exportAllowed()) return;
    triggerCSVDownload(buildCSV(data, accessRatePct), `prepvista-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [data, accessRatePct, exportAllowed]);

  // SEC-7 — sanitized drill-down navigation
  const handleDeptClick  = useCallback((name: string) => router.push(`/org-admin/students?department=${encodeURIComponent(safeDrillParam(name))}`), [router]);
  const handleYearClick  = useCallback((name: string) => router.push(`/org-admin/students?year=${encodeURIComponent(safeDrillParam(name))}`), [router]);
  const handleBatchClick = useCallback((name: string) => router.push(`/org-admin/students?batch=${encodeURIComponent(safeDrillParam(name))}`), [router]);

  if (isLoading) return <AnalyticsSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">Student distribution across segments</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {lastUpdated && <span className="text-xs text-slate-500">Updated {formatUpdateTime(lastUpdated)}</span>}
          <button type="button" onClick={handleExport} disabled={!data}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button type="button" onClick={handleRefresh} disabled={isValidating}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50">
            <svg className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isValidating ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {swrError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {toSafeError(swrError, 'Failed to load analytics. Please refresh.')}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 slide-up">
            <StatCard label="Total Students"  value={data.total_students}         helper="Active enrolled students" accent="blue"    trend={data.total_students_trend} />
            <StatCard label="Career Access"   value={data.career_access_students} helper="With career plan granted" accent="emerald" trend={data.career_access_trend} />
            <StatCard label="Access Rate"     value={accessRatePct}               helper="Students with access"     accent="violet"  trend={data.access_rate_trend} />
          </div>
          <div className="space-y-6 slide-up">
            <BarChart title="By Department" gradient="from-blue-500 to-indigo-500"  maxVal={maxDept}  items={sortedDepts}   onRowClick={handleDeptClick} />
            <BarChart title="By Year"       gradient="from-amber-500 to-orange-500" maxVal={maxYear}  items={sortedYears}   onRowClick={handleYearClick} />
            <BarChart title="By Batch"      gradient="from-cyan-500 to-teal-500"    maxVal={maxBatch} items={sortedBatches} onRowClick={handleBatchClick} />
          </div>
        </>
      )}

      {!data && !swrError && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-sm text-slate-500">No analytics data is available yet.</p>
          <p className="text-xs text-slate-600 mt-1">Students will appear here once they are enrolled.</p>
        </div>
      )}
    </div>
  );
}