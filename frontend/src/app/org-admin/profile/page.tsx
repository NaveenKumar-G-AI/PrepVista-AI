'use client';
/**
 * PrepVista — College Admin: Profile
 * Shows admin info + organization context from the dashboard API.
 */

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useOrgContext } from '../layout';
import { BuildingIcon, SettingsIcon, UserIcon } from '@/components/icons';

export default function OrgAdminProfilePage() {
  const { user } = useAuth();
  const { orgName, orgCode, seatLimit, seatsUsed } = useOrgContext();

  const seatPct = seatLimit ? Math.min(100, (seatsUsed / seatLimit) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="fade-in">
        <h1 className="text-2xl font-bold text-white">Admin Profile</h1>
        <p className="text-sm text-slate-400">Your account and organization information</p>
      </div>

      {/* Admin Info */}
      <div className="card !p-6 slide-up">
        <div className="flex items-center gap-4 mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-500/15 text-blue-400">
            <UserIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">{user?.full_name || 'College Administrator'}</h2>
            <p className="text-sm text-slate-400">{user?.email || ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Role', value: 'College Admin' },
            { label: 'Plan', value: user?.plan || 'free' },
            { label: 'Org Admin', value: user?.is_org_admin ? 'Yes' : 'No' },
            { label: 'Account ID', value: user?.id?.slice(0, 8) || '—' },
          ].map(item => (
            <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{item.label}</div>
              <div className="mt-1 text-sm text-white capitalize">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Organization Info */}
      <div className="card !p-6 slide-up">
        <div className="flex items-center gap-4 mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-500/15 text-violet-400">
            <BuildingIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">{orgName || 'Organization'}</h2>
            <p className="text-sm text-slate-400 font-mono">{orgCode}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Organization Name', value: orgName || '—' },
            { label: 'Organization Code', value: orgCode || '—' },
            { label: 'Seat Limit', value: String(seatLimit) },
            { label: 'Seats Used', value: String(seatsUsed) },
            { label: 'Seats Available', value: String(Math.max(0, seatLimit - seatsUsed)) },
            { label: 'Utilization', value: `${Math.round(seatPct)}%` },
          ].map(item => (
            <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{item.label}</div>
              <div className="mt-1 text-sm text-white">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-2 text-xs text-slate-500 font-semibold">Seat Usage</div>
        <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${seatPct > 90 ? 'bg-gradient-to-r from-rose-500 to-red-500' : seatPct > 70 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
            style={{ width: `${Math.max(2, seatPct)}%` }} />
        </div>
      </div>

      {/* Quick Links */}
      <div className="card !p-6 slide-up">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Links</h3>
        <div className="flex flex-wrap gap-3">
          <Link href="/profile" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2">
            <UserIcon size={16} /> Account Settings
          </Link>
          <Link href="/settings" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2">
            <SettingsIcon size={16} /> Workspace Settings
          </Link>
          <Link href="/dashboard" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white hover:bg-white/10 transition-colors">
            ← Back to Main Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
