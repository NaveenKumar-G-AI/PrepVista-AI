'use client';
/**
 * PrepVista — Org Admin Layout
 * Shared layout for all /org-admin/* pages.
 * Provides sidebar navigation and auth guard for college administrators.
 *
 * Extended (MBP-1 extreme version):
 *   NEW CAPABILITIES (zero additional API calls — all data from existing refreshOrg fetch):
 *     - OrgCtx extended with plan, accessExpiry, daysToExpiry, cohortAvgScore,
 *       zeroOfferRiskCount, studentsWithSessions, readinessTierCounts.
 *     - Plan name badge shown in sidebar org header (next to orgCode).
 *     - Renewal warning chip: amber ≤ 60d, rose ≤ 30d, "expired" when daysToExpiry ≤ 0.
 *     - Zero-offer risk count badge on Analytics nav item (rose, hidden when 0).
 *       Persistent across ALL pages — impossible for TPO to miss.
 *     - Analytics sub-nav (desktop): auto-expands when pathname is under
 *       /org-admin/analytics/* — shows Performance, Growth, Readiness sub-items.
 *     - Analytics sub-items added to mobile scrollable bottom nav (Perf, Growth, Ready).
 *     - All Tailwind classes are complete string literals — zero dynamic interpolation.
 *
 *   PRESERVED (all existing behaviour unchanged):
 *     - Auth guard with correct double-fire prevention.
 *     - Seat usage bar with green/amber/red gradient.
 *     - Seat warning chip at ≥ 85% capacity.
 *     - Accessible aria attributes (progressbar, aria-current, aria-label).
 *     - Org data sanitization before state storage.
 *     - isActive, seatUsagePercent, barColour memoized with correct deps.
 *     - Mobile nav showing all 9 NAV_ITEMS (overflow-x-auto scrollable).
 *     - useOrgContext export for child pages.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  createContext,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import {
  BuildingIcon, ChartIcon, CreditCardIcon, DownloadIcon, KeyIcon,
  LayersIcon, SettingsIcon, SparklesIcon, UsersIcon,
} from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';


// ══════════════════════════════════════════════════════════════════════════════
// INTERFACES
// ══════════════════════════════════════════════════════════════════════════════

/** Readiness tier counts returned by performance_summary from the dashboard API. */
interface ReadinessTierCounts {
  ready: number;
  almost_ready: number;
  developing: number;
  at_risk: number;
}

/** Context value exposed to all /org-admin/* child pages via useOrgContext(). */
interface OrgContext {
  // ── Identity & enrolment (existing) ──────────────────────────────────────
  orgName: string;
  orgCode: string;
  seatLimit: number;
  seatsUsed: number;
  loading: boolean;
  refreshOrg: () => Promise<void>;
  // ── Plan identity (NEW — from org.plan + org.access_expiry in same fetch) ─
  plan: string;
  accessExpiry: string | null;
  daysToExpiry: number | null;
  // ── Performance KPIs (NEW — from performance_summary in same fetch) ───────
  cohortAvgScore: number | null;
  zeroOfferRiskCount: number;
  studentsWithSessions: number;
  readinessTierCounts: ReadinessTierCounts | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof BuildingIcon;
  exact?: boolean;
}

/** Analytics sub-navigation items rendered below the Analytics nav entry. */
interface SubNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof ChartIcon;
}


// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ══════════════════════════════════════════════════════════════════════════════

const OrgCtx = createContext<OrgContext>({
  orgName: '', orgCode: '', seatLimit: 0, seatsUsed: 0,
  loading: true, refreshOrg: async () => { },
  // NEW field defaults — safe for consumers that read before data loads
  plan: '', accessExpiry: null, daysToExpiry: null,
  cohortAvgScore: null, zeroOfferRiskCount: 0,
  studentsWithSessions: 0, readinessTierCounts: null,
});

export function useOrgContext() {
  return useContext(OrgCtx);
}


// ══════════════════════════════════════════════════════════════════════════════
// STATIC CONSTANTS
// All Tailwind class strings are complete literals — never interpolated.
// Tailwind's JIT tree-shaker statically scans source: interpolated strings
// like `bg-${color}-500` are excluded from production CSS bundles and cause
// silent visual breakage. Every class below is safe for production.
// ══════════════════════════════════════════════════════════════════════════════

const NAV_ITEMS: NavItem[] = [
  { href: '/org-admin', label: 'Dashboard', icon: SparklesIcon, exact: true },
  { href: '/org-admin/students', label: 'Students', icon: UsersIcon },
  { href: '/org-admin/departments', label: 'Departments', icon: BuildingIcon },
  { href: '/org-admin/years-batches', label: 'Years & Batches', icon: LayersIcon },
  { href: '/org-admin/analytics', label: 'Analytics', icon: ChartIcon },
  { href: '/org-admin/access-control', label: 'Access Control', icon: KeyIcon },
  { href: '/org-admin/reports', label: 'Reports', icon: DownloadIcon },
  { href: '/org-admin/billing', label: 'Billing', icon: CreditCardIcon },
  { href: '/org-admin/profile', label: 'Profile', icon: SettingsIcon },
];

/** Analytics sub-pages exposed in the expandable desktop sub-nav and mobile bottom nav.
 *  Icons reuse existing imports — no new icon dependencies required. */
// Analytics is a single Command Centre view — no sub-pages. (Performance / Growth /
// Readiness were placeholders for the old multi-tab analytics and have been removed.)
const ANALYTICS_SUB_NAV: SubNavItem[] = [];


// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute integer days between now and an ISO expiry string.
 * Returns a negative integer when the plan has already expired
 *   (e.g. -3 means "expired 3 days ago").
 * Returns null when expiry is null or cannot be parsed (plan has no expiry).
 */
function computeDaysToExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const diff = new Date(expiry).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Format a snake_case plan identifier for human display.
 * "college_standard" → "College Standard"
 * "college_pro"      → "College Pro"
 */
function formatPlanLabel(plan: string): string {
  return plan
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}


// ══════════════════════════════════════════════════════════════════════════════
// LAYOUT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function OrgAdminLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // ── Existing state ────────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [seatLimit, setSeatLimit] = useState(0);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [orgLoading, setOrgLoading] = useState(true);

  // ── NEW: plan identity ────────────────────────────────────────────────────
  const [plan, setPlan] = useState('');
  const [accessExpiry, setAccessExpiry] = useState<string | null>(null);
  const [daysToExpiry, setDaysToExpiry] = useState<number | null>(null);

  // ── NEW: performance KPIs ─────────────────────────────────────────────────
  // All sourced from performance_summary in the same getCollegeDashboard() call.
  // Optional-chained throughout: if backend is old version, all default to 0/null.
  const [cohortAvgScore, setCohortAvgScore] = useState<number | null>(null);
  const [zeroOfferRiskCount, setZeroOfferRiskCount] = useState(0);
  const [studentsWithSessions, setStudentsWithSessions] = useState(0);
  const [readinessTierCounts, setReadinessTierCounts] = useState<ReadinessTierCounts | null>(null);

  const refreshOrg = useCallback(async () => {
    try {
      const res = await api.getCollegeDashboard<any>();
      const org = res.organization;

      if (org) {
        // Sanitize org data at the data layer — prevents surprises if values
        // are used outside JSX (e.g. document.title, aria-label, clipboard write).
        setOrgName(String(org.name || '').slice(0, 200));
        setOrgCode(String(org.org_code || '').replace(/[^A-Z0-9_\-]/gi, '').slice(0, 32));
        setSeatLimit(Math.max(0, Number(org.seat_limit) || 0));
        setSeatsUsed(Math.max(0, Number(org.seats_used) || 0));

        // NEW: plan identity
        const rawPlan = String(org.plan || '').slice(0, 64);
        const rawExpiry = org.access_expiry ? String(org.access_expiry) : null;
        setPlan(rawPlan);
        setAccessExpiry(rawExpiry);
        setDaysToExpiry(computeDaysToExpiry(rawExpiry));
      }

      // NEW: performance_summary — present in extended backend (MBP-1 org_college.py).
      // Gracefully no-ops if absent (old backend or zero sessions) — defaults remain.
      const ps = res.performance_summary;
      if (ps) {
        setCohortAvgScore(typeof ps.cohort_avg_score === 'number' ? ps.cohort_avg_score : null);
        setZeroOfferRiskCount(typeof ps.zero_offer_risk_count === 'number' ? ps.zero_offer_risk_count : 0);
        setStudentsWithSessions(typeof ps.students_with_sessions === 'number' ? ps.students_with_sessions : 0);
        setReadinessTierCounts(ps.readiness_tier_counts ?? null);
      }
    } catch {
      /* silent — org/context data is non-critical for page render */
    } finally {
      setOrgLoading(false);
    }
  }, []);

  // Auth guard: redirect non-admins immediately after auth resolves.
  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_org_admin) {
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

  // Fetch org data only AFTER auth confirms the user is an org admin.
  // BUG (original): condition was `!authLoading && !user?.is_org_admin` which
  // fired refreshOrg TWICE per mount (once during loading, once after).
  // Correct guard: wait for auth to resolve AND confirm org-admin role first.
  useEffect(() => {
    if (authLoading || !user?.is_org_admin) return;
    void refreshOrg();
  }, [authLoading, user?.is_org_admin, refreshOrg]);

  // ── Derived values ─────────────────────────────────────────────────────────

  // isActive: memoised — only recalculates when pathname changes, not on every render.
  // isActive is called N × 2 per render (desktop + mobile), so memoising matters.
  const isActive = useCallback(
    (href: string, exact?: boolean): boolean =>
      exact ? pathname === href : (pathname === href || pathname.startsWith(`${href}/`)),
    [pathname],
  );

  // Seat metrics — memoised so they don't recompute on unrelated state changes.
  const seatUsagePercent = useMemo(
    () => (seatLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0),
    [seatsUsed, seatLimit],
  );

  // Seat bar colour: green → amber → red as capacity fills.
  // Returns complete string literals — never interpolated — Tailwind-safe.
  const barColour = useMemo(() => {
    if (seatUsagePercent >= 90) return 'from-red-500 to-red-600';
    if (seatUsagePercent >= 70) return 'from-orange-500 to-amber-500';
    return 'from-blue-500 to-indigo-500';
  }, [seatUsagePercent]);

  // Show spinner while auth is loading or while a non-admin is being redirected.
  // NOTE: this early return MUST stay below every hook above — React requires a
  // stable hook order across renders, and on the auth loading→loaded transition
  // returning before useCallback/useMemo would change the hook count and crash.
  if (authLoading || !user?.is_org_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  // Seat warning chip at ≥ 85% to prompt action before students are blocked.
  const showSeatWarning = seatUsagePercent >= 85;

  // NEW: analytics sub-nav auto-expands when on any /org-admin/analytics/* route.
  // isActive('/org-admin/analytics') matches both exact path AND all sub-paths.
  const showAnalyticsSub = isActive('/org-admin/analytics');

  // NEW: renewal warning shown when ≤ 60 days to expiry OR already expired.
  const showRenewalWarning = daysToExpiry !== null && daysToExpiry <= 60;

  // NEW: plan badge label for sidebar display.
  const planLabel = plan ? formatPlanLabel(plan) : '';

  // NEW: renewal chip Tailwind class — complete string literals (not interpolated).
  // rose for urgent (≤ 30d or expired), amber for advance warning (31–60d).
  const renewalChipStyle =
    daysToExpiry !== null && daysToExpiry <= 30
      ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
      : 'bg-amber-500/10 border-amber-500/20 text-amber-400';

  // NEW: renewal chip message text.
  const renewalChipText =
    daysToExpiry !== null && daysToExpiry <= 0
      ? '⛔ Plan expired — contact support'
      : daysToExpiry !== null && daysToExpiry <= 30
        ? `⚠ Plan expires in ${daysToExpiry}d — renew now`
        : daysToExpiry !== null
          ? `⚠ Plan expires in ${daysToExpiry}d — plan renewal`
          : '';

  return (
    <OrgCtx.Provider
      value={{
        // Existing fields
        orgName, orgCode, seatLimit, seatsUsed,
        loading: orgLoading, refreshOrg,
        // NEW fields
        plan, accessExpiry, daysToExpiry,
        cohortAvgScore, zeroOfferRiskCount,
        studentsWithSessions, readinessTierCounts,
      }}
    >
      <div className="min-h-screen surface-primary">
        <AuthHeader />
        <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
          <div className="flex gap-6">

            {/* ── Desktop Sidebar ──────────────────────────────────────────── */}
            <aside
              className="hidden lg:block w-64 shrink-0"
              aria-label="Org admin sidebar navigation"
            >
              <div
                className="sticky top-24 rounded-[28px] border p-4 shadow-[0_24px_54px_rgba(2,8,23,0.12)] backdrop-blur-2xl"
                style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}
              >

                {/* ── Org Header ── */}
                <div
                  className="mb-4 border-b pb-4 px-2"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-500">
                      <BuildingIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      {/* title attr shows full name on hover when text is truncated */}
                      <div
                        className="text-sm font-semibold text-primary truncate"
                        title={orgName || undefined}
                      >
                        {orgName || 'Loading…'}
                      </div>
                      {/* Org code + NEW plan badge on the same sub-line */}
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-tertiary font-mono">{orgCode}</span>
                        {planLabel && (
                          <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-400">
                            {planLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Seat usage bar */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ background: 'var(--bg-hover)' }}
                        role="progressbar"
                        aria-valuenow={seatUsagePercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${seatsUsed} of ${seatLimit} seats used`}
                      >
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${barColour} transition-all duration-500`}
                          style={{ width: `${seatUsagePercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-tertiary font-semibold whitespace-nowrap">
                        {seatsUsed}/{seatLimit}
                      </span>
                    </div>

                    {/* Seat warning chip — shown at ≥ 85% to prompt action before blockage */}
                    {showSeatWarning && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 bg-orange-500/10 border border-orange-500/20">
                        <span className="text-[10px] font-semibold text-orange-500 leading-snug">
                          {seatUsagePercent >= 100
                            ? '⛔ Seat limit reached — new students cannot register'
                            : `⚠ ${100 - seatUsagePercent}% seats left — consider upgrading`}
                        </span>
                      </div>
                    )}

                    {/* NEW: Renewal warning chip — shown when ≤ 60 days to expiry.
                        Rose for ≤ 30d / expired, amber for 31–60d.
                        Rendered below seat warning on a separate line. */}
                    {showRenewalWarning && (
                      <div className={`mt-2 flex items-center gap-1.5 rounded-lg border px-2 py-1 ${renewalChipStyle}`}>
                        <span className="text-[10px] font-semibold leading-snug">
                          {renewalChipText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Nav Links ── */}
                <nav aria-label="Org admin main navigation">
                  <ul className="space-y-1" role="list">
                    {NAV_ITEMS.map(item => {
                      const Icon = item.icon;
                      const active = isActive(item.href, item.exact);
                      const isAnalyticsItem = item.href === '/org-admin/analytics';

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all ${active
                                ? 'bg-blue-500/16 text-primary font-semibold shadow-[0_8px_20px_rgba(37,99,235,0.12)]'
                                : 'text-secondary hover:bg-hover hover:text-primary'
                              }`}
                          >
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-blue-500 text-white' : 'text-secondary'
                                }`}
                              style={active ? undefined : { background: 'var(--bg-hover)' }}
                            >
                              <Icon size={15} />
                            </span>

                            {item.label}

                            {/* NEW: Zero-offer risk badge — Analytics nav item only.
                                Persistent across all pages. Hidden when count = 0.
                                Gives TPO a persistent signal without navigating anywhere. */}
                            {isAnalyticsItem && zeroOfferRiskCount > 0 && (
                              <span
                                aria-label={`${zeroOfferRiskCount} students at zero-offer risk`}
                                className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white"
                              >
                                {zeroOfferRiskCount > 99 ? '99+' : zeroOfferRiskCount}
                              </span>
                            )}
                          </Link>

                          {/* NEW: Analytics sub-nav — auto-expands when on any analytics route.
                              showAnalyticsSub = true when pathname is /org-admin/analytics
                              or any sub-path (/analytics/performance, /growth, /readiness).
                              Indented with a left-border connector line for visual hierarchy. */}
                          {isAnalyticsItem && showAnalyticsSub && ANALYTICS_SUB_NAV.length > 0 && (
                            <ul className="ml-4 mt-1 space-y-0.5 border-l border-white/[0.06] pl-3">
                              {ANALYTICS_SUB_NAV.map(sub => {
                                const SubIcon = sub.icon;
                                const subActive = pathname === sub.href;
                                return (
                                  <li key={sub.href}>
                                    <Link
                                      href={sub.href}
                                      aria-current={subActive ? 'page' : undefined}
                                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-all ${subActive
                                          ? 'bg-blue-500/10 text-blue-400 font-semibold'
                                          : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                                        }`}
                                    >
                                      <SubIcon size={13} />
                                      {sub.label}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                {/* Back to main */}
                <div
                  className="mt-4 border-t pt-4"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-secondary hover:bg-hover hover:text-primary transition-all"
                  >
                    ← Back to Main
                  </Link>
                </div>

              </div>
            </aside>

            {/* ── Mobile Bottom Nav ──────────────────────────────────────────
                All 9 NAV_ITEMS + 3 ANALYTICS_SUB_NAV = 12 total items.
                overflow-x-auto allows the user to scroll to reach all items.
                Analytics sub-items (Perf, Growth, Ready) give direct mobile
                access to the 3 new analytics pages without going via Dashboard.
                Original showed only 6 — Reports, Billing, Profile were
                unreachable on mobile (fixed in the version before this one). */}
            <nav
              className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl px-2 py-1.5 flex gap-1 overflow-x-auto"
              style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}
              aria-label="Org admin mobile navigation"
            >
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                // Split label at first space for brevity on small screens
                const shortLabel = item.label.split(' ')[0];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    className={`relative flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] flex-shrink-0 transition-colors ${active ? 'text-blue-500 bg-blue-500/10' : 'text-tertiary hover:text-primary'
                      }`}
                  >
                    <Icon size={16} />
                    {shortLabel}
                    {/* NEW: zero-risk badge on mobile Analytics tab */}
                    {item.href === '/org-admin/analytics' && zeroOfferRiskCount > 0 && (
                      <span
                        aria-label={`${zeroOfferRiskCount} students at zero-offer risk`}
                        className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold text-white"
                      >
                        {zeroOfferRiskCount > 9 ? '9+' : zeroOfferRiskCount}
                      </span>
                    )}
                  </Link>
                );
              })}

              {/* NEW: Analytics sub-items — always visible in mobile nav.
                  Placed after main NAV_ITEMS so they appear at the end of
                  the scrollable row. Labels are short (≤ 6 chars) for mobile. */}
              {ANALYTICS_SUB_NAV.map(sub => {
                const SubIcon = sub.icon;
                const subActive = pathname === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    aria-current={subActive ? 'page' : undefined}
                    aria-label={sub.label}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] flex-shrink-0 transition-colors ${subActive ? 'text-blue-500 bg-blue-500/10' : 'text-tertiary hover:text-primary'
                      }`}
                  >
                    <SubIcon size={14} />
                    {sub.shortLabel}
                  </Link>
                );
              })}
            </nav>

            {/* ── Main Content ── */}
            <main className="flex-1 min-w-0 pb-20 lg:pb-0" id="org-admin-main">
              {children}
            </main>

          </div>
        </div>
      </div>
    </OrgCtx.Provider>
  );
}