'use client';
/**
 * PrepVista — Student Dashboard Layout
 * Layout wrapper for /student-dashboard pages.
 * Auth guard: redirects non-org-student users to /dashboard.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { useAuth } from '@/lib/auth-context';

export default function StudentDashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // Non-org-student users should not be here
    if (!user.org_student) {
      if (user.is_org_admin) {
        router.replace('/org-admin');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [authLoading, user, router]);

  // We don't block rendering here. Let the page mount so it can fetch data concurrently.
  // The page will show its own skeleton loader if auth is still loading.
  if (!authLoading && !user?.org_student) {
    return null; // Will be redirected by useEffect
  }

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </div>
    </div>
  );
}
