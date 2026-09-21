'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Brain,
  LayoutDashboard,
  ClipboardList,
  Target,
  TrendingUp,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

interface SidebarProps {
  user: {
    name: string;
    role: string;
    email: string;
  };
  currentPath: string;
}

const studentNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/skills', label: 'Skill Graph', icon: Target },
  { href: '/recommendations', label: 'Action Center', icon: TrendingUp },
];

const tpoNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'College Analytics', icon: BarChart3 },
  { href: '/students', label: 'Students', icon: Users },
];

export function Sidebar({ user, currentPath }: SidebarProps) {
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItems =
    user.role === 'STUDENT'
      ? studentNavItems
      : user.role === 'SUPER_ADMIN'
        ? [tpoNavItems[0]]
        : tpoNavItems;

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    router.push('/login');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border/50 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Brain className="h-7 w-7 text-primary" />
          <span className="text-lg font-bold">PrepVista</span>
        </Link>
        <button
          className="lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              currentPath === item.href
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            onClick={() => setIsMobileOpen(false)}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border/50 p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.role.replace('_', ' ')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Logout">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col border-r border-border/50 bg-background">
        {sidebarContent}
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-50 flex h-16 items-center justify-between border-b border-border/50 bg-background px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Brain className="h-7 w-7 text-primary" />
          <span className="text-lg font-bold">PrepVista</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-background shadow-xl animate-slide-right">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}