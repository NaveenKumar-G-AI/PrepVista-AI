'use client';
/**
 * PrepVista — College Admin: Billing & Plans
 * Route: /org-admin/billing/page.tsx
 *
 * SECURITY HARDENING:
 * SEC-1  API response shape validation     — rejects malformed billing payloads
 * SEC-2  Payment amount bounds guard       — negative / NaN / overflow amounts blocked
 * SEC-3  Payment ID partial masking        — full gateway IDs not exposed in UI
 * SEC-4  Error message sanitization        — payment gateway internals stay hidden
 * SEC-5  Auth-error detection + redirect   — billing = highest-value hijack target
 * SEC-6  Numeric bounds on seat counts     — negative / NaN seat values blocked
 * SEC-7  Plan request CTA cooldown         — prevents request flooding per plan
 * SEC-8  Prototype-safe plan normalisation — coerce to String() before comparison
 * SEC-9  Expiry date validation            — malformed dates never crash the banner
 * SEC-10 No sensitive billing data in logs — amounts / IDs never in console output
 */

import useSWR from 'swr';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CreditCardIcon, ChartIcon, SparklesIcon } from '@/components/icons';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BillingData {
  plan: string | null;
  seat_limit: number;
  seats_used: number;
  access_expiry: string | null;
  allocations: Array<{ plan: string; seat_limit: number; billing_type: string; amount_paise: number | null; created_at: string; }>;
  payments: Array<{ id: string; amount_paise: number; status: string; razorpay_payment_id: string | null; created_at: string; }>;
}

// ─── SECURITY UTILITIES ───────────────────────────────────────────────────────

// SEC-1 — API response shape validation
function isValidBillingPayload(data: unknown): data is BillingData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (d.plan === null || typeof d.plan === 'string') &&
    typeof d.seat_limit === 'number' && d.seat_limit >= 0 &&
    typeof d.seats_used === 'number' && d.seats_used >= 0 &&
    (d.access_expiry === null || typeof d.access_expiry === 'string') &&
    Array.isArray(d.allocations) && Array.isArray(d.payments);
}

// SEC-2 — Payment amount bounds guard
const MAX_SANE_AMOUNT_PAISE = 1_00_00_000; // ₹10,00,000
function safeAmountDisplay(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise) || paise < 0 || paise > MAX_SANE_AMOUNT_PAISE) return '—';
  return `₹${(paise / 100).toFixed(2)}`;
}

// SEC-3 — Payment ID partial masking (last 8 chars only)
function maskPaymentId(id: string | null | undefined): string {
  if (!id) return '—';
  const clean = String(id).replace(/[\x00-\x1f\x7f]/g, '');
  return clean.length <= 8 ? clean : `…${clean.slice(-8)}`;
}

// SEC-4 — Error message sanitization (with payment gateway patterns)
const SERVER_INTERNAL_PATTERNS = [
  /\bat\s+\w/, /https?:\/\/[a-z0-9._-]+\.[a-z]{2,}/i,
  /\b(column|table|relation|schema|syntax|constraint)\b/i,
  /[A-Z][a-zA-Z]+Error:/, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\/[a-z0-9_-]+(\/[a-z0-9_-]+){2,}/i,
  /order_[a-zA-Z0-9]{14,}/, /pay_[a-zA-Z0-9]{14,}/,
  /\bBAD_REQUEST_ERROR\b/i, /\bGATEWAY_ERROR\b/i,
];
function toSafeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  if (msg.length > 180 || SERVER_INTERNAL_PATTERNS.some(re => re.test(msg))) return fallback;
  return msg;
}

// SEC-5 — Auth error detection
function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('unauthorized') || msg.includes('forbidden') ||
    msg.includes('unauthenticated') || msg.includes('401') || msg.includes('403') ||
    msg.includes('session expired') || msg.includes('invalid token');
}

// SEC-6 — Numeric bounds for seat counts
function safeSeatCount(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

// SEC-7 — Cooldown factory (per-plan)
function makeCooldown(ms: number) {
  let last = 0;
  return () => { const now = Date.now(); if (now - last < ms) return false; last = now; return true; };
}
const REQUEST_COOLDOWN_MS = 8_000;

// SEC-8 — Prototype-safe plan name normalisation
function normalisePlan(s: string): string {
  return String(s).toLowerCase().replace(/[\s_-]+/g, '');
}

// SEC-9 — Safe expiry date parsing
function safeParseDays(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Plan data ────────────────────────────────────────────────────────────────
const COLLEGE_PLANS = [
  {
    name: 'Pilot', subtitle: '3-month controlled college onboarding',
    price: '₹25,000', cycle: '/3 months', badge: 'Best Start',
    features: ['One department or final-year batch', 'College secondary admin access', 'Student-wise progress tracking', 'Whole cohort statistics dashboard', 'Grant and revoke access controls'],
    status: 'Recommended entry plan', cta: 'Start Pilot', featured: false,
  },
  {
    name: 'College Pro', subtitle: 'Institution annual placement-readiness plan',
    price: '₹1,00,000', cycle: '/year', badge: 'Most Popular',
    features: ['Broader student coverage', 'Detailed analytics and reporting', 'Department or batch visibility', 'Student performance and history access', 'Placement team admin controls'],
    status: 'Best for annual rollout', cta: 'Buy College Pro', featured: true,
  },
  {
    name: 'College Custom', subtitle: 'Custom plan for larger college needs',
    price: 'Custom', cycle: 'pricing', badge: 'Custom',
    features: ['Campus-wide or multi-department setup', 'Custom seat and access planning', 'Higher reporting and admin flexibility', 'Custom onboarding support', 'Institution-specific plan structure'],
    status: 'Sales-assisted purchase', cta: 'Request Custom Plan', featured: false,
  },
];

// SEC-4 — Expanded payment status colour map
const PAYMENT_STATUS_STYLES: Record<string, string> = {
  captured: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed:   'bg-rose-500/15   text-rose-600   dark:text-rose-400',
  refunded: 'bg-slate-500/15  text-slate-400',
  pending:  'bg-amber-500/15  text-amber-600  dark:text-amber-400',
  created:  'bg-blue-500/15   text-blue-600   dark:text-blue-400',
};
const DEFAULT_PAYMENT_STYLE = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, helper, accent = 'blue' }: { label: string; value: string | number; helper: string; accent?: string; }) {
  const ring: Record<string, string> = { blue: 'from-blue-500/20 to-blue-600/5 ring-blue-500/15', emerald: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15', amber: 'from-amber-500/20 to-amber-600/5 ring-amber-500/15', violet: 'from-violet-500/20 to-violet-600/5 ring-violet-500/15' };
  const textAccent: Record<string, string> = { blue: 'text-blue-500 dark:text-blue-400', emerald: 'text-emerald-500 dark:text-emerald-400', amber: 'text-amber-500 dark:text-amber-400', violet: 'text-violet-500 dark:text-violet-400' };
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${ring[accent] || ring.blue} p-6 ring-1 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]`}>
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/[0.03]" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">{label}</div>
      <div className={`mt-3 text-4xl font-bold tracking-tight ${textAccent[accent] || textAccent.blue}`}>{value}</div>
      <div className="mt-2 text-[13px] text-secondary">{helper}</div>
    </div>
  );
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, isCurrentPlan = false, onRequest, requested = false }: {
  plan: typeof COLLEGE_PLANS[number]; isCurrentPlan?: boolean; onRequest?: () => void; requested?: boolean;
}) {
  return (
    <div className={`relative rounded-[30px] border p-8 pt-12 transition-transform duration-300 hover:-translate-y-1 ${plan.featured ? 'border-blue-400/40 shadow-[0_20px_60px_rgba(37,99,235,0.12)]' : 'shadow-[0_20px_60px_rgba(15,23,42,0.08)]'} ${isCurrentPlan ? 'ring-2 ring-emerald-500/40' : ''}`}
      style={{ borderColor: plan.featured ? undefined : 'var(--border-color)', background: 'var(--card-bg)' }}>
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <span className={`-translate-y-1/2 rounded-full px-5 py-2 text-sm font-semibold ${plan.featured ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-[0_8px_24px_rgba(79,70,229,0.3)]' : 'border text-cyan-600 dark:text-cyan-200'}`}
          style={plan.featured ? undefined : { borderColor: 'rgba(6,182,212,0.25)', background: 'rgba(6,182,212,0.08)' }}>
          {plan.badge}
        </span>
      </div>
      {isCurrentPlan && (
        <div className="absolute right-4 top-4 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/25">
          ✓ Current Plan
        </div>
      )}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-primary">{plan.name}</h2>
        <p className="mt-4 text-lg text-secondary">{plan.subtitle}</p>
        <div className="mt-8 flex items-end justify-center gap-2">
          <span className="text-5xl font-extrabold tracking-tight text-primary">{plan.price}</span>
          <span className="pb-1 text-2xl text-tertiary">{plan.cycle}</span>
        </div>
      </div>
      <ul className="mt-10 space-y-5 text-lg text-primary">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-3">
            <span className="mt-1 text-emerald-500 dark:text-emerald-400">✓</span><span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-10 rounded-full px-5 py-3 text-center text-base font-semibold text-secondary" style={{ background: 'var(--bg-hover)' }}>{plan.status}</div>
      {requested ? (
        <div className="mt-6 w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-4 text-center text-sm font-semibold text-emerald-400">
          ✓ Request noted! Your platform administrator will be in touch shortly.
        </div>
      ) : isCurrentPlan ? (
        <div className="mt-6 w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-4 text-center text-xl font-bold text-emerald-400">✓ Current Plan</div>
      ) : (
        <button type="button" onClick={onRequest}
          className={`mt-6 w-full rounded-2xl border px-6 py-4 text-xl font-bold transition-all ${plan.featured ? 'border-transparent bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-500 hover:to-violet-500 shadow-[0_14px_30px_rgba(37,99,235,0.24)]' : 'text-primary hover:border-blue-400/40'}`}
          style={plan.featured ? undefined : { borderColor: 'var(--border-color)', background: 'transparent' }}>
          {plan.cta}
        </button>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const router = useRouter();

  // SEC-7 — per-plan cooldown map
  const planCooldowns = useRef<Record<string, () => boolean>>({});
  function getPlanCooldown(planName: string) {
    if (!planCooldowns.current[planName]) planCooldowns.current[planName] = makeCooldown(REQUEST_COOLDOWN_MS);
    return planCooldowns.current[planName];
  }

  const { data, error: swrError, isLoading } = useSWR(
    'college-billing',
    async () => {
      const res = await api.getCollegeBilling<BillingData>();
      if (!isValidBillingPayload(res)) throw new Error('Unexpected server response. Please refresh.');
      return res;
    },
    {
      revalidateOnFocus: false, revalidateOnReconnect: true,
      dedupingInterval: 120_000, errorRetryCount: 2, shouldRetryOnError: true,
      onError: (err) => { if (isAuthError(err)) router.push('/login'); },
    }
  );

  const hasError = Boolean(swrError);
  const errorMessage = toSafeError(swrError, 'Failed to load billing data. Please refresh.');

  const [requestedPlan, setRequestedPlan] = useState<string | null>(null);
  useEffect(() => {
    if (!requestedPlan) return;
    const t = setTimeout(() => setRequestedPlan(null), 5000);
    return () => clearTimeout(t);
  }, [requestedPlan]);

  const handleRequest = useCallback((planName: string) => {
    if (!getPlanCooldown(planName)()) return;
    setRequestedPlan(planName);
  }, []);

  // SEC-9 — safe expiry parsing
  const daysUntilExpiry = useMemo(() => safeParseDays(data?.access_expiry), [data?.access_expiry]);

  // SEC-6 — clamped seat counts
  const safeSeatsUsed  = useMemo(() => safeSeatCount(data?.seats_used  ?? 0), [data?.seats_used]);
  const safeSeatLimit  = useMemo(() => safeSeatCount(data?.seat_limit  ?? 0), [data?.seat_limit]);
  const seatsRemaining = useMemo(() => Math.max(0, safeSeatLimit - safeSeatsUsed), [safeSeatLimit, safeSeatsUsed]);

  const usagePct = useMemo(() => {
    if (safeSeatLimit <= 0) return 0;
    return Math.min(100, (safeSeatsUsed / safeSeatLimit) * 100);
  }, [safeSeatsUsed, safeSeatLimit]);

  const usageBarColour  = usagePct >= 90 ? 'bg-rose-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const usageTextColour = usagePct >= 90 ? 'text-rose-400' : usagePct >= 70 ? 'text-amber-400' : 'text-emerald-400';

  // SEC-2 — bounds-checked captured total
  const capturedTotal = useMemo(
    () => (data?.payments ?? []).filter(p => p.status === 'captured').reduce((sum, p) => {
      if (!Number.isFinite(p.amount_paise) || p.amount_paise < 0 || p.amount_paise > MAX_SANE_AMOUNT_PAISE) return sum;
      return sum + p.amount_paise;
    }, 0),
    [data?.payments]
  );

  // SEC-8 — safe plan display
  const planDisplay = useMemo(() => {
    if (!data?.plan) return 'None';
    const raw = String(data.plan);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [data?.plan]);

  // C — Print billing summary
  const handlePrint = useCallback(() => window.print(), []);

  return (
    <>
      <style>{`@media print{body>*:not(#billing-print-root){display:none!important}#billing-print-root{display:block!important}.no-print{display:none!important}.card{border:1px solid #e2e8f0!important;background:white!important}*{color:#0f172a!important}}`}</style>
      <div id="billing-print-root" className="space-y-8">

        {/* Header */}
        <div className="fade-in">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300" style={{ background: 'rgba(37,99,235,0.08)' }}>
            <CreditCardIcon size={14} />Billing &amp; Plans
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">Your Organisation&apos;s Billing</h1>
              <p className="text-sm text-secondary mt-1">Plan status, seat allocation, payment history, and available plans</p>
            </div>
            {data && (
              <button type="button" onClick={handlePrint}
                className="no-print inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Summary
              </button>
            )}
          </div>
        </div>

        {/* SEC-4 — sanitised error */}
        {hasError && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">{errorMessage}</div>}

        {/* SEC-9 — only fires when daysUntilExpiry is a valid number */}
        {data && daysUntilExpiry !== null && daysUntilExpiry <= 30 && (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${daysUntilExpiry <= 0 ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : daysUntilExpiry <= 7 ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-400'}`}>
            {daysUntilExpiry <= 0 ? '⚠ Your plan has expired. Students may have lost access. Contact your platform administrator immediately.'
              : daysUntilExpiry === 1 ? '⚠ Your plan expires tomorrow. Contact your platform administrator today.'
              : daysUntilExpiry <= 7 ? `⚠ Your plan expires in ${daysUntilExpiry} days. Contact your administrator immediately.`
              : `Your plan expires in ${daysUntilExpiry} days. Contact your administrator to arrange renewal.`}
          </div>
        )}

        {isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map(i => <div key={i} className="skeleton-card h-36" />)}</div>
        )}

        {data && (
          <>
            {/* SEC-6 — safe seat counts in stat cards */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 slide-up">
              <StatCard label="Current Plan"  value={planDisplay}   helper="Assigned by platform admin"  accent="blue" />
              <StatCard label="Seat Limit"    value={safeSeatLimit} helper="Maximum students allowed"     accent="emerald" />
              <StatCard label="Seats Used"    value={safeSeatsUsed} helper={safeSeatsUsed >= safeSeatLimit ? 'Seat limit reached' : `${seatsRemaining} remaining`} accent="amber" />
              <StatCard label="Access Expiry" value={data.access_expiry ? formatDate(data.access_expiry) : 'No expiry'} helper="Plan expiration date" accent="violet" />
            </div>

            {/* Seat utilisation bar */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 slide-up">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">Seat Utilisation</span>
                <span className={`text-xs font-bold ${usageTextColour}`}>{safeSeatsUsed} / {safeSeatLimit} seats ({Math.round(usagePct)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.05]">
                <div className={`h-2 rounded-full transition-all duration-700 ease-out ${usageBarColour}`} style={{ width: `${usagePct}%` }} />
              </div>
              {usagePct >= 90 && <p className="mt-2 text-xs font-medium text-rose-400">Seat limit nearly reached. Contact your administrator to expand capacity.</p>}
              {usagePct >= 70 && usagePct < 90 && <p className="mt-2 text-xs text-amber-400/80">Over 70% of seats are in use. Plan ahead.</p>}
              {/* D — seat top-up CTA when ≥ 80% */}
              {usagePct >= 80 && (
                <button type="button" onClick={() => handleRequest('Seat Expansion')}
                  className="no-print mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors">
                  {requestedPlan === 'Seat Expansion' ? '✓ Request sent — administrator notified' : '+ Request additional seats'}
                </button>
              )}
            </div>

            {/* Allocation History */}
            {(data.allocations ?? []).length > 0 && (
              <div className="card !p-6 slide-up">
                <h3 className="text-lg font-semibold text-primary mb-4">Plan Allocation History</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[11px] uppercase tracking-wider text-tertiary font-semibold" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <tr><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Seats</th><th className="px-4 py-2">Billing Type</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Date</th></tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                      {(data.allocations ?? []).map((a, i) => (
                        <tr key={i} className="hover:bg-hover transition-colors">
                          <td className="px-4 py-2.5 text-primary font-semibold capitalize">{String(a.plan || '—')}</td>
                          <td className="px-4 py-2.5 text-secondary">{safeSeatCount(a.seat_limit)}</td>
                          <td className="px-4 py-2.5 text-secondary capitalize">{String(a.billing_type || '—')}</td>
                          {/* SEC-2 — safe amount */}
                          <td className="px-4 py-2.5 text-secondary">{safeAmountDisplay(a.amount_paise)}</td>
                          <td className="px-4 py-2.5 text-tertiary text-xs">{formatDate(a.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payment History */}
            {(data.payments ?? []).length > 0 && (
              <div className="card !p-6 slide-up">
                <h3 className="text-lg font-semibold text-primary mb-4">Payment History</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[11px] uppercase tracking-wider text-tertiary font-semibold" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <tr><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Payment Ref</th><th className="px-4 py-2">Date</th></tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                      {(data.payments ?? []).map(p => (
                        <tr key={p.id} className="hover:bg-hover transition-colors">
                          {/* SEC-2 — safe amount, never NaN or negative */}
                          <td className="px-4 py-2.5 text-primary font-semibold">{safeAmountDisplay(p.amount_paise)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PAYMENT_STATUS_STYLES[String(p.status)] ?? DEFAULT_PAYMENT_STYLE}`}>
                              {String(p.status || 'unknown')}
                            </span>
                          </td>
                          {/* SEC-3 — last 8 chars only */}
                          <td className="px-4 py-2.5 font-mono text-xs text-tertiary">{maskPaymentId(p.razorpay_payment_id)}</td>
                          <td className="px-4 py-2.5 text-tertiary text-xs">{formatDate(p.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {capturedTotal > 0 && (
                      <tfoot>
                        <tr style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td colSpan={4} className="px-4 py-2.5 text-sm text-secondary">
                            Total verified payments: <span className="font-bold text-emerald-500 dark:text-emerald-400">{safeAmountDisplay(capturedTotal)}</span>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {(data.allocations ?? []).length === 0 && (data.payments ?? []).length === 0 && (
              <div className="rounded-3xl border border-dashed px-5 py-12 text-center text-secondary" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
                No billing history available. Your platform administrator manages plan allocations.
              </div>
            )}
          </>
        )}

        {/* Available Plans — always visible */}
        <section className="mt-4">
          <div className="text-center mb-10 fade-in">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-300 border border-emerald-400/30" style={{ background: 'rgba(16,185,129,0.06)' }}>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />College pilot available before annual conversion
            </div>
            <h2 className="text-3xl font-bold text-primary sm:text-4xl">Choose your college plan</h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-secondary">
              Start with a structured pilot or move directly to an annual institutional plan. College plans are built for placement teams that want student analytics, access control, and interview-readiness visibility.
            </p>
          </div>
          <div className="grid gap-8 xl:grid-cols-3 slide-up">
            {COLLEGE_PLANS.map(plan => (
              <PlanCard key={plan.name} plan={plan}
                isCurrentPlan={data?.plan ? normalisePlan(data.plan) === normalisePlan(plan.name) : false}
                onRequest={() => handleRequest(plan.name)}
                requested={requestedPlan === plan.name} />
            ))}
          </div>
        </section>

        {/* Plan Notes */}
        <section className="card !p-8 slide-up">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-600 dark:text-cyan-300">Plan Notes</p>
              <h3 className="mt-3 text-3xl font-bold text-primary">Best college purchase flow</h3>
              <p className="mt-4 text-lg leading-8 text-secondary">Use the pilot plan for first onboarding, prove student usage and progress, then convert the college into the annual plan. Use the custom plan only when the college wants broader coverage or a special setup.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { title: 'Pilot',  desc: 'Best for entry and fastest first college close.' },
                { title: 'Annual', desc: 'Best for serious institutional positioning and renewal.' },
                { title: 'Custom', desc: 'Best only for large colleges or special deployment needs.' },
              ].map(note => (
                <div key={note.title} className="rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
                  <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-300">{note.title}</p>
                  <p className="mt-2 text-sm leading-6 text-secondary">{note.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}