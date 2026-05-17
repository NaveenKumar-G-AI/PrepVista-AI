'use client';
/**
 * PrepVista — College Admin Dashboard
 * Overview with stats, recent students, and quick action links.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { BuildingIcon, ChartIcon, KeyIcon, SparklesIcon, UsersIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface DashboardData {
  organization: any;
  total_students: number;
  career_access_students: number;
  departments: number;
  years: number;
  batches: number;
  seat_limit: number;
  seats_used: number;
  recent_students: Array<{
    id: string;
    student_code: string | null;
    has_career_access: boolean;
    added_at: string;
    email: string;
    full_name: string | null;
  }>;
}

function StatCard({ label, value, helper, accent = 'blue' }: { label: string; value: string | number; helper: string; accent?: string }) {
  const ring: Record<string, string> = { blue: 'from-blue-500/20 to-blue-600/5 ring-blue-500/15', emerald: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15', violet: 'from-violet-500/20 to-violet-600/5 ring-violet-500/15', amber: 'from-amber-500/20 to-amber-600/5 ring-amber-500/15', cyan: 'from-cyan-500/20 to-cyan-600/5 ring-cyan-500/15' };
  const text: Record<string, string> = { blue: 'text-blue-400', emerald: 'text-emerald-400', violet: 'text-violet-400', amber: 'text-amber-400', cyan: 'text-cyan-400' };
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${ring[accent] || ring.blue} p-5 ring-1 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]`}>
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.03]" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${text[accent] || text.blue}`}>{value}</div>
      <div className="mt-1 text-[12px] text-slate-500">{helper}</div>
    </div>
  );
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function OrgAdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCollegeDashboard<DashboardData>()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'));
  }, []);

  if (!data && !error) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  const seatPercent = data ? Math.min(100, data.seat_limit ? (data.seats_used / data.seat_limit) * 100 : 0) : 0;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.18),transparent_25%),radial-gradient(circle_at_85%_18%,rgba(99,102,241,0.14),transparent_30%),linear-gradient(135deg,#07111f_0%,#0c1830_48%,#0f1b31_100%)] px-7 py-8 text-white shadow-[0_30px_80px_rgba(2,8,23,0.34)] fade-in">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative z-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
            <SparklesIcon size={14} />
            College Dashboard
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">
            Welcome, {(user?.full_name || 'Admin').split(' ')[0]}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
            Manage your college&apos;s students, departments, and career access from this dashboard. {data?.total_students || 0} students enrolled with {data?.career_access_students || 0} having career access.
          </p>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 slide-up">
        <StatCard label="Total Students" value={data?.total_students || 0} helper="Active enrolled" accent="blue" />
        <StatCard label="Career Access" value={data?.career_access_students || 0} helper="With plan granted" accent="emerald" />
        <StatCard label="Departments" value={data?.departments || 0} helper="Active segments" accent="violet" />
        <StatCard label="Years" value={data?.years || 0} helper="Year groups" accent="amber" />
        <StatCard label="Batches" value={data?.batches || 0} helper="Batch groups" accent="cyan" />
        <StatCard label="Seat Usage" value={`${data?.seats_used || 0}/${data?.seat_limit || 0}`} helper={`${Math.round(seatPercent)}% utilized`} accent="blue" />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 slide-up">
        {[
          { href: '/org-admin/students', label: 'Manage Students', desc: 'Add, edit, or bulk upload', icon: UsersIcon, color: 'blue' },
          { href: '/org-admin/access-control', label: 'Access Control', desc: 'Grant or revoke career access', icon: KeyIcon, color: 'emerald' },
          { href: '/org-admin/analytics', label: 'View Analytics', desc: 'Department & year stats', icon: ChartIcon, color: 'violet' },
          { href: '/org-admin/departments', label: 'Departments', desc: 'Manage segments', icon: BuildingIcon, color: 'amber' },
        ].map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className="card !p-5 group hover:border-blue-500/30 transition-all">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-${item.color}-500/15 text-${item.color}-400 mb-3`}>
                <Icon size={18} />
              </div>
              <div className="text-sm font-semibold text-white">{item.label}</div>
              <div className="text-xs text-slate-400 mt-1">{item.desc}</div>
            </Link>
          );
        })}
      </div>

      {/* Recent Students */}
      <section className="card !p-6 slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recently Added Students</h2>
          <Link href="/org-admin/students" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">View all →</Link>
        </div>
        {data?.recent_students?.length ? (
          <div className="space-y-2">
            {data.recent_students.map(s => (
              <Link key={s.id} href={`/org-admin/students/${s.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.05] transition-colors">
                <div>
                  <div className="text-sm font-semibold text-white">{s.full_name || 'Unnamed Student'}</div>
                  <div className="text-xs text-slate-400">{s.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    s.has_career_access ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'
                  }`}>
                    {s.has_career_access ? 'Career' : 'No Access'}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(s.added_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
            No students enrolled yet. <Link href="/org-admin/students" className="text-blue-400 hover:underline">Add your first student</Link>.
          </div>
        )}
      </section>
    </div>
  );
}
