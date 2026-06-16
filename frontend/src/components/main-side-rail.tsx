'use client';

import type { ReactElement, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  BuildingIcon,
  ChartIcon,
  ClockIcon,
  CrownIcon,
  FeedbackIcon,
  FolderIcon,
  HomeIcon,
  KeyIcon,
  PlayIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
} from './icons';

type RailIcon = (props: SVGProps<SVGSVGElement> & { size?: number }) => ReactElement;

interface RailItem {
  href: string;
  label: string;
  description: string;
  icon: RailIcon;
  onClick?: (e: React.MouseEvent) => void;
}

interface MainSideRailProps {
  startInterviewHref: string;
  liveSessionHref: string;
  careerHref: string;
  showAdminLink?: boolean;
  showOrgAdminLink?: boolean;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RailLink({ item, pathname }: { item: RailItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      title={item.label}
      onClick={item.onClick}
      className={`group/item flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-all ${
        active
          ? 'bg-blue-500/16 text-primary shadow-[0_18px_36px_rgba(37,99,235,0.12)]'
          : 'text-secondary hover:bg-hover hover:text-primary'
      }`}
    >
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
        active ? 'bg-blue-500 text-white' : 'text-secondary'
      }`} style={active ? undefined : { background: 'var(--bg-hover)' }}>
        <Icon size={18} />
      </span>

      <span className="min-w-0 max-w-0 overflow-hidden opacity-0 transition-all duration-300 group-hover/rail:max-w-[180px] group-hover/rail:opacity-100 group-focus-within/rail:max-w-[180px] group-focus-within/rail:opacity-100">
        <span className="block whitespace-nowrap text-sm font-semibold">{item.label}</span>
        <span className="block whitespace-nowrap text-xs text-tertiary">{item.description}</span>
      </span>
    </Link>
  );
}

export function MainSideRail({ startInterviewHref, liveSessionHref, careerHref, showAdminLink = false, showOrgAdminLink = false }: MainSideRailProps) {
  const pathname = usePathname();
  const router = useRouter();

  const practiceItems: RailItem[] = [
    {
      href: startInterviewHref,
      label: startInterviewHref === '/pricing' ? 'Start Interview (Locked)' : 'Start Interview',
      description: startInterviewHref === '/pricing' ? 'Quota reached' : 'Open a fresh mock',
      icon: PlayIcon,
      onClick: (e) => {
        if (startInterviewHref === '/pricing') {
          e.preventDefault();
          alert('Your quota is reached. If you want to use more, please buy Career or Pro based on your current plan.');
          router.push('/pricing');
        }
      }
    },
    {
      href: liveSessionHref,
      label: 'Resume Session',
      description: 'Return to active work',
      icon: ClockIcon,
    },
    {
      href: careerHref,
      label: 'Career Mode',
      description: 'Move into premium depth',
      icon: CrownIcon,
    },
  ];

  const workspaceItems: RailItem[] = [
    {
      href: '/analytics',
      label: 'Analytics',
      description: 'See coaching signals',
      icon: ChartIcon,
    },
    {
      href: '/history',
      label: 'Sessions',
      description: 'Open interview history',
      icon: FolderIcon,
    },
    {
      href: '/profile',
      label: 'Profile',
      description: 'Account and plans',
      icon: UserIcon,
    },
    {
      href: '/feedback',
      label: 'Feedback',
      description: 'Share product feedback',
      icon: FeedbackIcon,
    },
    {
      href: '/settings',
      label: 'Settings',
      description: 'Theme and controls',
      icon: SettingsIcon,
    },
  ];

  if (showAdminLink) {
    workspaceItems.splice(3, 0, {
      href: '/admin',
      label: 'Admin',
      description: 'Users, grants, and feedback',
      icon: ShieldIcon,
    });
    workspaceItems.splice(4, 0, {
      href: '/admin/colleges',
      label: 'Colleges',
      description: 'Manage B2B organizations',
      icon: BuildingIcon,
    });
  }

  // Org admin items
  const orgAdminItems: RailItem[] = showOrgAdminLink ? [
    {
      href: '/org-admin',
      label: 'College Dashboard',
      description: 'Org overview',
      icon: BuildingIcon,
    },
    {
      href: '/org-admin/students',
      label: 'Students',
      description: 'Manage students',
      icon: UsersIcon,
    },
    {
      href: '/org-admin/analytics',
      label: 'Org Analytics',
      description: 'Department stats',
      icon: ChartIcon,
    },
    {
      href: '/org-admin/access-control',
      label: 'Access Control',
      description: 'Grant & revoke seats',
      icon: KeyIcon,
    },
  ] : [];

  // Mobile bottom nav items — condensed set of most important links
  const mobileNavItems: Array<{ href: string; label: string; icon: RailIcon }> = [
    { href: '/dashboard', label: 'Home', icon: HomeIcon },
    { href: startInterviewHref === '/pricing' ? '/pricing' : '/interview/setup', label: 'Practice', icon: PlayIcon },
    { href: '/history', label: 'Sessions', icon: FolderIcon },
    { href: '/analytics', label: 'Analytics', icon: ChartIcon },
    { href: '/profile', label: 'Profile', icon: UserIcon },
  ];

  // Add org-admin for college admins, or admin for platform admins
  if (showOrgAdminLink) {
    mobileNavItems.push({ href: '/org-admin', label: 'College', icon: BuildingIcon });
  } else if (showAdminLink) {
    mobileNavItems.push({ href: '/admin', label: 'Admin', icon: ShieldIcon });
  }

  return (
    <>
      {/* Desktop sidebar — xl and up */}
      <aside className="hidden xl:block">
        <div className="group/rail sticky top-28 w-[84px] transition-all duration-300 hover:w-[308px] focus-within:w-[308px]">
          <div className="rounded-[28px] border p-3 shadow-[0_24px_54px_rgba(2,8,23,0.12)] backdrop-blur-2xl" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
            <div className="mb-3 overflow-hidden border-b px-2 pb-3" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-secondary" style={{ background: 'var(--bg-hover)' }}>
                  <SparklesIcon size={18} />
                </span>
                <span className="min-w-0 max-w-0 overflow-hidden opacity-0 transition-all duration-300 group-hover/rail:max-w-[190px] group-hover/rail:opacity-100 group-focus-within/rail:max-w-[190px] group-focus-within/rail:opacity-100">
                  <span className="block whitespace-nowrap text-sm font-semibold text-primary">Quick Workspace</span>
                  <span className="block whitespace-nowrap text-xs text-tertiary">Hover to expand actions</span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="overflow-hidden px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary transition-all duration-300 max-h-0 opacity-0 group-hover/rail:max-h-8 group-hover/rail:opacity-100 group-focus-within/rail:max-h-8 group-focus-within/rail:opacity-100">
                Practice
              </div>
              {practiceItems.map(item => (
                <RailLink key={item.label} item={item} pathname={pathname} />
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
              <div className="overflow-hidden px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary transition-all duration-300 max-h-0 opacity-0 group-hover/rail:max-h-8 group-hover/rail:opacity-100 group-focus-within/rail:max-h-8 group-focus-within/rail:opacity-100">
                Workspace
              </div>
              {workspaceItems.map(item => (
                <RailLink key={item.label} item={item} pathname={pathname} />
              ))}
            </div>

            {orgAdminItems.length > 0 && (
              <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
                <div className="overflow-hidden px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary transition-all duration-300 max-h-0 opacity-0 group-hover/rail:max-h-8 group-hover/rail:opacity-100 group-focus-within/rail:max-h-8 group-focus-within/rail:opacity-100">
                  Organization
                </div>
                {orgAdminItems.map(item => (
                  <RailLink key={item.label} item={item} pathname={pathname} />
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile bottom navigation — below xl */}
      <div className="xl:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl safe-area-bottom" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
        <div className="flex justify-around items-center px-1 py-1.5">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-blue-500 bg-blue-500/10' : 'text-tertiary hover:text-primary'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
