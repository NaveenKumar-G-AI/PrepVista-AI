'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

export interface CodingAccess {
  schema_version: 1;
  student_profile_id: string;
  enabled: boolean;
  execution_language: 'javascript';
  result_authority: 'CLIENT_REPORTED';
  persistence: 'BROWSER_TAB' | 'SERVER';
  server_sync: boolean;
  ai_mentoring: boolean;
  ai_provider?: string | null;
  readiness_updates: boolean;
  guest_import?: boolean;
  server_validation?: boolean;
  interview_credits_consumed: 0;
}

export function useCodingAccess() {
  const { user, loading } = useAuth();
  const profileId = loading ? undefined : user?.id;
  const [result, setResult] = useState<{ profileId: string; access?: CodingAccess; error?: string }>();
  useEffect(() => {
    if (!profileId) return;
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const access = await api.request<CodingAccess>('/coding/access', { retries: 0, timeoutMs: 8000 });
        if (access.schema_version !== 1 || access.student_profile_id !== profileId ||
            access.result_authority !== 'CLIENT_REPORTED' || typeof access.server_sync !== 'boolean' ||
            typeof access.readiness_updates !== 'boolean' || typeof access.ai_mentoring !== 'boolean' ||
            (access.server_validation !== undefined && typeof access.server_validation !== 'boolean') ||
            !['BROWSER_TAB', 'SERVER'].includes(access.persistence) || access.execution_language !== 'javascript' ||
            access.interview_credits_consumed !== 0 || typeof access.enabled !== 'boolean') {
          throw new Error('Coding access could not be verified.');
        }
        if (active) setResult({ profileId, access });
      } catch {
        if (active) setResult({ profileId, error: 'Coding practice is temporarily unavailable. Your other workspaces are still available.' });
      } finally { pending = false; }
    };
    void check();
    const timer = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, [profileId]);
  const current = profileId && result?.profileId === profileId ? result : undefined;
  return { user, loading: loading || (!!profileId && !current), access: current?.access, error: current?.error };
}

export function CodingNavLink() {
  const { access } = useCodingAccess();
  if (!access?.enabled) return null;
  return <Link href="/coding" className="inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium text-secondary hover:bg-hover">Coding</Link>;
}

export function CodingGate({ children }: { children: ReactNode }) {
  const { user, loading, access, error } = useCodingAccess();
  if (loading) return <p role="status" className="p-6">Checking coding access…</p>;
  if (!user) return <section className="card p-6 space-y-4"><h1 className="text-2xl font-semibold">Sign in to practise coding</h1><p>Use your PrepVista account to continue.</p><Link href="/login" className="btn-primary inline-flex">Sign in</Link></section>;
  if (!access?.enabled) return <section className="card p-6 space-y-4"><h1 className="text-2xl font-semibold">Coding practice</h1><p role="status">{error || 'Coding practice is being introduced to a small pilot group. It is not enabled for your account yet.'}</p><Link href={user.org_student ? '/student-dashboard' : '/dashboard'} className="btn-secondary inline-flex">Return to my dashboard</Link><Link className="underline block" href="/coding-recovery">Recover saved coding work</Link></section>;
  // Changing identity remounts every editor and terminates its worker. A late
  // access response for another profile can never mount that profile's work.
  return <section key={user.id}>{children}</section>;
}
