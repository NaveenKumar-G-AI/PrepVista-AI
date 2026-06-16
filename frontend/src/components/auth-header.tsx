'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { BrandLogo } from '@/components/brand-logo';

import {
  ArrowLeftIcon,
  BuildingIcon,
  ChartIcon,
  CreditCardIcon,
  FeedbackIcon,
  HistoryIcon,
  HomeIcon,
  LogoutIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from './icons';

interface AuthHeaderProps {
  backHref?: string;
  backLabel?: string;
}

// Updated to support exact matching — prevents parent routes from staying
// active when a more-specific child route is also listed in the nav.
// Default (exact = false) preserves original startsWith behaviour for all
// callers that don't pass the third argument.
function matchesPath(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      // aria-current="page" satisfies WCAG 2.1 SC 4.1.2 — screen readers can
      // announce the current location. undefined removes the attribute when inactive.
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? 'bg-blue-500/14 text-primary shadow-[0_10px_24px_rgba(14,165,233,0.12)] ring-1 ring-blue-500/20'
          : 'text-secondary hover:bg-hover hover:text-primary'
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="inline-flex items-center justify-center rounded-full border border-border-color bg-hover p-2.5 text-secondary transition-all hover:text-primary hover:border-blue-400/40"
      style={{ borderColor: 'var(--border-color)' }}
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export function AuthHeader({ backHref, backLabel = 'Back' }: AuthHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  // ── Two-step logout state ─────────────────────────────────────────────────
  // idle      → first click  → shows "Confirm?" and starts 3s auto-reset timer
  // confirming → second click → disables button, calls logout(), shows "Signing out…"
  // loading   → logout() in flight, button fully disabled (prevents double-submit)
  // This eliminates accidental logouts on mobile where touch targets are close.
  const [logoutStep, setLogoutStep] = useState<'idle' | 'confirming' | 'loading'>('idle');

  // ── Single source of truth for role-aware home destination ────────────────
  // Used in the logo link AND the handleBack fallback — prevents drift when
  // a new role is added later (update here only, it propagates everywhere).
  const homeHref = user?.is_org_admin
    ? '/org-admin'
    : user?.org_student
    ? '/student-dashboard'
    : '/dashboard';

  // Build nav items based on role:
  // - Org admins: ONLY admin links (no interviews, no sessions, no pricing)
  // - Org students: No billing
  // - Platform admins: Everything + admin link
  // - Regular users: Standard interview workspace links
  //
  // `exact: true` on root/dashboard items prevents startsWith from matching
  // child pages and causing two nav items to appear active simultaneously.
  const navItems = useMemo(() => {
    // College admins see ONLY their admin workspace — they don't take interviews
    if (user?.is_org_admin) {
      return [
        { href: '/org-admin', label: 'Dashboard', icon: HomeIcon, exact: true },
        { href: '/org-admin/students', label: 'Students', icon: UserIcon },
        { href: '/org-admin/analytics', label: 'Analytics', icon: ChartIcon },
        { href: '/org-admin/access-control', label: 'Access', icon: ShieldIcon },
        { href: '/org-admin/billing', label: 'Billing', icon: CreditCardIcon },
        { href: '/org-admin/profile', label: 'Profile', icon: SettingsIcon },
      ];
    }

    // Org students — dedicated student workspace, no billing
    if (user?.org_student) {
      return [
        { href: '/student-dashboard', label: 'Main', icon: HomeIcon, exact: true },
        { href: '/history', label: 'Sessions', icon: HistoryIcon },
        { href: '/analytics', label: 'Analytics', icon: ChartIcon },
        { href: '/feedback', label: 'Feedback', icon: FeedbackIcon },
        { href: '/settings', label: 'Settings', icon: SettingsIcon },
      ];
    }

    // Regular users / platform admins — interview workspace
    const items: Array<{ href: string; label: string; icon: typeof HomeIcon; exact?: boolean }> = [
      { href: '/dashboard', label: 'Main', icon: HomeIcon, exact: true },
      { href: '/history', label: 'Sessions', icon: HistoryIcon },
      { href: '/analytics', label: 'Analytics', icon: ChartIcon },
    ];

    items.push({ href: '/pricing', label: 'Billing', icon: CreditCardIcon });

    items.push(
      { href: '/feedback', label: 'Feedback', icon: FeedbackIcon },
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    );

    // Admin link for platform admins
    if (user?.is_admin || user?.premium_override) {
      items.push({ href: '/admin', label: 'Admin', icon: ShieldIcon });
    }

    return items;
  }, [user?.org_student, user?.is_admin, user?.premium_override, user?.is_org_admin]);

  const displayName = user?.full_name?.split(' ')[0] || 'Workspace';
  const activePlan = (user?.active_plan || user?.plan || 'free').toUpperCase();
  const initial = displayName.charAt(0).toUpperCase();

  // ── Back navigation ───────────────────────────────────────────────────────
  // Falls back to role-aware homeHref instead of the hardcoded '/dashboard',
  // so org students and org admins land on their correct home screen.
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    if (backHref) {
      router.push(backHref);
      return;
    }
    router.push(homeHref);
  }, [backHref, homeHref, router]);

  // ── Two-step logout ───────────────────────────────────────────────────────
  const handleLogoutClick = useCallback(() => {
    if (logoutStep === 'idle') {
      setLogoutStep('confirming');
      // Auto-reset if the user doesn't confirm within 3 seconds.
      setTimeout(() => {
        setLogoutStep(prev => (prev === 'confirming' ? 'idle' : prev));
      }, 3000);
      return;
    }

    if (logoutStep === 'confirming') {
      setLogoutStep('loading');
      // Promise.resolve wraps both sync and async logout implementations safely.
      Promise.resolve(logout()).finally(() => {
        // Reset in case navigation doesn't unmount the component.
        setLogoutStep('idle');
      });
    }
    // logoutStep === 'loading': button is disabled, this branch is unreachable.
  }, [logoutStep, logout]);

  const logoutLabel =
    logoutStep === 'confirming'
      ? 'Confirm?'
      : logoutStep === 'loading'
      ? 'Signing out…'
      : 'Sign Out';

  return (
    <nav className="sticky top-0 z-40 border-b px-4 py-4 backdrop-blur-2xl transition-colors" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          {backHref ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-all hover:border-blue-400/30" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
            >
              <ArrowLeftIcon size={16} />
              <span>{backLabel}</span>
            </button>
          ) : null}

          {/* homeHref replaces the inline ternary chain — single source of truth */}
          <Link href={homeHref} className="rounded-full border px-3 py-2 pr-4 transition-all hover:border-blue-400/30" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
            <BrandLogo
              size={44}
              priority
              className="flex items-center gap-3"
              imageClassName="rounded-2xl object-contain shadow-[0_14px_28px_rgba(37,99,235,0.24)]"
              nameClassName="text-[15px] font-semibold tracking-[0.01em] text-primary"
              subtitle="AI Interview Workspace"
              subtitleClassName="text-[11px] uppercase tracking-[0.18em] text-tertiary"
            />
          </Link>
        </div>

        <div className="flex flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:justify-center">
          {navItems.map(item => {
            const Icon = item.icon;
            // Pass item.exact so root dashboard items only activate on exact match,
            // preventing simultaneous dual active highlights on sub-pages.
            const active = matchesPath(pathname, item.href, item.exact);
            return (
              <NavLink key={item.href} href={item.href} label={item.label} active={active}>
                <Icon size={16} />
              </NavLink>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ThemeToggle />

          <Link
            href="/profile"
            className="inline-flex items-center gap-3 rounded-full border px-3 py-2.5 text-left transition-all hover:border-blue-400/30" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-sm font-bold text-white shadow-[0_12px_22px_rgba(14,165,233,0.32)]">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-primary">{displayName}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary" style={{ background: 'var(--bg-hover)' }}>
                <UserIcon size={12} />
                {activePlan}
              </div>
            </div>
          </Link>

          {/* Two-step logout: first click = confirm, second click = execute.
              Button is disabled during the loading phase to prevent double-submit. */}
          <button
            type="button"
            onClick={handleLogoutClick}
            disabled={logoutStep === 'loading'}
            aria-label={
              logoutStep === 'confirming'
                ? 'Click again to confirm sign out'
                : 'Sign out of your account'
            }
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2.5 text-sm font-medium transition-all ${
              logoutStep === 'confirming'
                ? 'border-rose-400/50 bg-rose-500/20 text-rose-400'
                : logoutStep === 'loading'
                ? 'cursor-not-allowed border-rose-400/10 bg-rose-500/5 text-rose-500/40'
                : 'border-rose-400/18 bg-rose-500/8 text-rose-500 hover:border-rose-300/30 hover:bg-rose-500/14'
            }`}
          >
            <LogoutIcon size={16} />
            <span>{logoutLabel}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}