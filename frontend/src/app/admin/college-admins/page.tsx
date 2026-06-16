'use client';
/**
 * PrepVista — Admin: College Admins Management
 * List, create, enable/disable college admins across all organizations.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { PlusIcon, SearchIcon, ShieldIcon, UsersIcon, XIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface OrgAdmin {
  id: string;
  organization_id: string;
  organization_name: string;
  org_code: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
}

interface CreateAdminForm {
  organization_id: string;
  email: string;
  full_name: string;
  phone: string;
}

function statusBadge(s: string) {
  if (s === 'active') return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20';
  if (s === 'suspended') return 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20';
  return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CollegeAdminsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [admins, setAdmins] = useState<OrgAdmin[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateAdminForm>({ organization_id: '', email: '', full_name: '', phone: '' });
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [adminsRes, orgsRes] = await Promise.all([
        api.listOrgAdmins<{ admins: OrgAdmin[] }>(),
        api.listOrganizations<{ organizations: any[] }>('page_size=200'),
      ]);
      setAdmins(adminsRes.admins || []);
      setOrgs(orgsRes.organizations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_admin) { router.push('/dashboard'); return; }
    loadData();
  }, [authLoading, user, router, loadData]);

  const filtered = search.trim()
    ? admins.filter(a =>
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.organization_name.toLowerCase().includes(search.toLowerCase()))
    : admins;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.organization_id || !form.email.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.createOrgAdmin({
        organization_id: form.organization_id,
        email: form.email.trim(),
        full_name: form.full_name || null,
        phone: form.phone || null,
      });
      setForm({ organization_id: '', email: '', full_name: '', phone: '' });
      setShowCreate(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (admin: OrgAdmin) => {
    setActionId(admin.id);
    try {
      if (admin.status === 'active') {
        await api.disableOrgAdmin(admin.id);
      } else {
        await api.enableOrgAdmin(admin.id);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionId(null);
    }
  };

  // Block rendering until auth resolves AND user is confirmed admin
  if (authLoading || !user || !user.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 fade-in">
          <div className="flex items-center gap-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-500/15 text-violet-400">
              <ShieldIcon size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">College Admins</h1>
              <p className="text-sm text-slate-400">Manage secondary admins across all colleges</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/colleges" className="btn-secondary !px-5 !py-2.5 text-sm">← Colleges</Link>
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary !px-5 !py-2.5 text-sm">
              <span className="inline-flex items-center gap-2"><PlusIcon size={16} />Add Admin</span>
            </button>
          </div>
        </div>

        {error && <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

        <div className="relative mb-6 slide-up">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by email, name, or organization..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Assign College Admin</h2>
                <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><XIcon size={20} /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Organization *</label>
                  <select value={form.organization_id} onChange={e => setForm(f => ({...f, organization_id: e.target.value}))} required
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
                    <option value="" disabled>Select a college...</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.org_code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">User Email *</label>
                  <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} type="email" required placeholder="Must be an existing PrepVista account"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Full Name</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Phone</label>
                    <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                  <button type="submit" disabled={creating} className="btn-primary flex-1 !py-2.5">{creating ? 'Assigning...' : 'Assign Admin'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-16 text-center text-slate-500">
            {search ? 'No admins match your search.' : 'No college admins created yet.'}
          </div>
        ) : (
          <div className="space-y-3 slide-up">
            {filtered.map(admin => (
              <div key={admin.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-white/[0.05] transition-colors backdrop-blur-sm">
                <div className="flex items-center gap-4">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400">
                    <UsersIcon size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{admin.full_name || 'College Admin'}</div>
                    <div className="text-xs text-slate-400">{admin.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{admin.organization_name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{admin.org_code}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right mr-2">
                    <div className="text-xs text-slate-500">Last login: {formatDate(admin.last_login)}</div>
                    <div className="text-xs text-slate-500">Created: {formatDate(admin.created_at)}</div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadge(admin.status)}`}>{admin.status}</span>
                  <button type="button" disabled={actionId === admin.id} onClick={() => handleToggle(admin)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      admin.status === 'active'
                        ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    } disabled:opacity-50`}>
                    {actionId === admin.id ? '...' : admin.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
