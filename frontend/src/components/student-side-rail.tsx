'use client';

/**
 * PrepVista — Student Side Rail
 * Simplified navigation rail for org_student users.
 * No plan switcher, no pricing, no referrals — only interview & workspace links.
 */

import type { ReactElement, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  ChartIcon,
  ClockIcon,
  CrownIcon,
  FeedbackIcon,
  FolderIcon,
  HomeIcon,
  PlayIcon,
  SettingsIcon,
  SparklesIcon,
  UserIcon,
} from './icons';

type RailIcon = (props: SVGProps<SVGSVGElement> & { size?: number }) => ReactElement;

interface RailItem {
  href: string;
  label: string;
  description: string;
  icon: RailIcon;
  onClick?: (e: React.MouseEvent) => void;
}

interface StudentSideRailProps {
  startInterviewHref: string;
  liveSessionHref: string;
  hasQuota: boolean;
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

export function StudentSideRail({ startInterviewHref, liveSessionHref, hasQuota }: StudentSideRailProps) {
  const pathname = usePathname();
  const router = useRouter();

  const practiceItems: RailItem[] = [
    {
      href: startInterviewHref,
      label: hasQuota ? 'Start Interview' : 'Start Interview (Locked)',
      description: hasQuota ? 'Open a fresh mock' : 'Quota reached',
      icon: PlayIcon,
      onClick: (e) => {
        if (!hasQuota) {
          e.preventDefault();
          alert('Your quota is reached. Contact your college administrator to get more access.');
        }
      },
    },
    {
      href: liveSessionHref,
      label: 'Resume Session',
      description: 'Return to active work',
      icon: ClockIcon,
    },
    {
      href: '/interview/setup',
      label: 'Career Mode',
      description: 'Full-depth interview',
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
      description: 'Account details',
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

  const mobileNavItems: Array<{ href: string; label: string; icon: RailIcon }> = [
    { href: '/student-dashboard', label: 'Home', icon: HomeIcon },
    { href: startInterviewHref === '/pricing' ? '/student-dashboard' : '/interview/setup', label: 'Practice', icon: PlayIcon },
    { href: '/history', label: 'Sessions', icon: FolderIcon },
    { href: '/analytics', label: 'Analytics', icon: ChartIcon },
    { href: '/profile', label: 'Profile', icon: UserIcon },
  ];

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
                  <span className="block whitespace-nowrap text-sm font-semibold text-primary">Student Workspace</span>
                  <span className="block whitespace-nowrap text-xs text-tertiary">College-managed access</span>
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
