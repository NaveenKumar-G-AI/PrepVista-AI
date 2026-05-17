'use client';
/**
 * PrepVista — Org Admin Layout
 * Shared layout for all /org-admin/* pages.
 * Provides sidebar navigation and auth guard for college administrators.
 */

import { useCallback, useContext, useEffect, useMemo, useState, createContext, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import {
  BuildingIcon, ChartIcon, CreditCardIcon, DownloadIcon, KeyIcon,
  LayersIcon, SettingsIcon, SparklesIcon, UsersIcon,
} from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface OrgContext {
  orgName: string;
  orgCode: string;
  seatLimit: number;
  seatsUsed: number;
  loading: boolean;
  refreshOrg: () => Promise<void>;
}

const OrgCtx = createContext<OrgContext>({
  orgName: '', orgCode: '', seatLimit: 0, seatsUsed: 0, loading: true, refreshOrg: async () => {},
});

export function useOrgContext() {
  return useContext(OrgCtx);
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof BuildingIcon;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/org-admin',              label: 'Dashboard',      icon: SparklesIcon,   exact: true },
  { href: '/org-admin/students',     label: 'Students',       icon: UsersIcon },
  { href: '/org-admin/departments',  label: 'Departments',    icon: BuildingIcon },
  { href: '/org-admin/years-batches',label: 'Years & Batches',icon: LayersIcon },
  { href: '/org-admin/analytics',    label: 'Analytics',      icon: ChartIcon },
  { href: '/org-admin/access-control',label: 'Access Control',icon: KeyIcon },
  { href: '/org-admin/reports',      label: 'Reports',        icon: DownloadIcon },
  { href: '/org-admin/billing',      label: 'Billing',        icon: CreditCardIcon },
  { href: '/org-admin/profile',      label: 'Profile',        icon: SettingsIcon },
];

export default function OrgAdminLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [orgName, setOrgName]     = useState('');
  const [orgCode, setOrgCode]     = useState('');
  const [seatLimit, setSeatLimit] = useState(0);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [orgLoading, setOrgLoading] = useState(true);

  const refreshOrg = useCallback(async () => {
    try {
      const res = await api.getCollegeDashboard<any>();
      const org = res.organization;
      if (org) {
        // Sanitize org data from API before storing in state.
        // While JSX auto-escapes text content, sanitising at the data layer
        // prevents surprises if any value is later used in a non-JSX context
        // (e.g. document.title, aria-label concatenation, clipboard write).
        setOrgName(String(org.name || '').slice(0, 200));
        setOrgCode(String(org.org_code || '').replace(/[^A-Z0-9_\-]/gi, '').slice(0, 32));
        setSeatLimit(Math.max(0, Number(org.seat_limit) || 0));
        setSeatsUsed(Math.max(0, Number(org.seats_used) || 0));
      }
    } catch { /* silent — org data is non-critical for page render */ } finally {
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

  // Fetch org data only AFTER auth has confirmed the user is an org admin.
  // BUG (original): condition was `!authLoading && !user?.is_org_admin` which
  // is FALSE when authLoading=true, causing refreshOrg to fire TWICE per mount
  // (once during loading, once after).  The corrected guard waits for auth to
  // finish and confirms org-admin role before calling the API.
  useEffect(() => {
    if (authLoading || !user?.is_org_admin) return;
    void refreshOrg();
  }, [authLoading, user?.is_org_admin, refreshOrg]);

  if (authLoading || (!user?.is_org_admin && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  // Memoised: only recalculates when pathname changes, not on every render.
  // isActive is called N times in the JSX (once per nav item × 2 for desktop+mobile).
  const isActive = useCallback((href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }, [pathname]);

  // Derived seat metrics — memoised so they don't recompute on unrelated state changes.
  const seatUsagePercent = useMemo(
    () => (seatLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0),
    [seatsUsed, seatLimit],
  );

  // Colour of the seat-usage bar: green → amber → red as capacity fills.
  // Gives the college admin a visual signal before they hit the seat wall and
  // students are blocked from registering — a direct purchase-renewal trigger.
  const barColour = useMemo(() => {
    if (seatUsagePercent >= 90) return 'from-red-500 to-red-600';
    if (seatUsagePercent >= 70) return 'from-orange-500 to-amber-500';
    return 'from-blue-500 to-indigo-500';
  }, [seatUsagePercent]);

  // Show a warning chip when 85 %+ of seats are occupied so the admin acts
  // before students are blocked.  At 100 % blocked = lost trust + churn.
  const showSeatWarning = seatUsagePercent >= 85;

  return (
    <OrgCtx.Provider value={{ orgName, orgCode, seatLimit, seatsUsed, loading: orgLoading, refreshOrg }}>
      <div className="min-h-screen surface-primary">
        <AuthHeader />
        <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
          <div className="flex gap-6">

            {/* ---- Sidebar (desktop) ---- */}
            <aside
              className="hidden lg:block w-64 shrink-0"
              aria-label="Org admin sidebar navigation"
            >
              <div
                className="sticky top-24 rounded-[28px] border p-4 shadow-[0_24px_54px_rgba(2,8,23,0.12)] backdrop-blur-2xl"
                style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}
              >
                {/* Org Header */}
                <div className="mb-4 border-b pb-4 px-2" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-500">
                      <BuildingIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      {/* title attr shows full name on hover when truncated */}
                      <div
                        className="text-sm font-semibold text-primary truncate"
                        title={orgName || undefined}
                      >
                        {orgName || 'Loading…'}
                      </div>
                      <div className="text-[11px] text-tertiary font-mono">{orgCode}</div>
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

                    {/* Seat warning — only shown at ≥ 85 % to prompt action before blockage */}
                    {showSeatWarning && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 bg-orange-500/10 border border-orange-500/20">
                        <span className="text-[10px] font-semibold text-orange-500 leading-snug">
                          {seatUsagePercent >= 100
                            ? '⛔ Seat limit reached — new students cannot register'
                            : `⚠ ${100 - seatUsagePercent}% seats left — consider upgrading`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nav Links */}
                <nav aria-label="Org admin main navigation">
                  <ul className="space-y-1" role="list">
                    {NAV_ITEMS.map(item => {
                      const Icon = item.icon;
                      const active = isActive(item.href, item.exact);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all ${
                              active
                                ? 'bg-blue-500/16 text-primary font-semibold shadow-[0_8px_20px_rgba(37,99,235,0.12)]'
                                : 'text-secondary hover:bg-hover hover:text-primary'
                            }`}
                          >
                            <span
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
                                active ? 'bg-blue-500 text-white' : 'text-secondary'
                              }`}
                              style={active ? undefined : { background: 'var(--bg-hover)' }}
                            >
                              <Icon size={15} />
                            </span>
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                {/* Back to main */}
                <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-secondary hover:bg-hover hover:text-primary transition-all"
                  >
                    ← Back to Main
                  </Link>
                </div>
              </div>
            </aside>

            {/* ---- Mobile Bottom Nav ---- */}
            {/* All 9 items shown (overflow-x-auto handles scroll).
                Original showed only 6 — Reports, Billing, and Profile were
                unreachable on mobile, which blocked admins from billing and
                settings actions on their phone. */}
            <nav
              className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl px-2 py-1.5 flex gap-1 overflow-x-auto"
              style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}
              aria-label="Org admin mobile navigation"
            >
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                // Split label: "Access Control" → "Access", "Years & Batches" → "Years"
                const shortLabel = item.label.split(' ')[0];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] flex-shrink-0 transition-colors ${
                      active ? 'text-blue-500 bg-blue-500/10' : 'text-tertiary hover:text-primary'
                    }`}
                  >
                    <Icon size={16} />
                    {shortLabel}
                  </Link>
                );
              })}
            </nav>

            {/* ---- Main Content ---- */}
            <main className="flex-1 min-w-0 pb-20 lg:pb-0" id="org-admin-main">
              {children}
            </main>

          </div>
        </div>
      </div>
    </OrgCtx.Provider>
  );
}