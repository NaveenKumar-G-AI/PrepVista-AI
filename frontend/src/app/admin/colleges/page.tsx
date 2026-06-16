'use client';
/**
 * PrepVista — Admin: College Admins Management
 * List, create, enable/disable college admins across all organizations.
 *
 * UPGRADED: Performance (useMemo, debounce, optimistic toggle, allSettled),
 * Reliability (AbortController, sanitized errors, stale-error clearing),
 * UX (success flash, sort controls, stats bar, Escape-to-close, result count,
 *     aria-labels, org_code search, descriptive loading text).
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { PlusIcon, SearchIcon, ShieldIcon, UsersIcon, XIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

/** Typed replacement for the previous `any[]` — forward-compatible via index sig */
interface Organization {
  id: string;
  name: string;
  org_code: string;
  [key: string]: unknown;
}

interface CreateAdminForm {
  organization_id: string;
  email: string;
  full_name: string;
  phone: string;
}

type SortKey = 'full_name' | 'organization_name' | 'status' | 'created_at' | 'last_login';
type SortDir = 'asc' | 'desc';

// ─── Sort label map ───────────────────────────────────────────────────────────

const SORT_LABELS: Record<SortKey, string> = {
  full_name:         'Name',
  organization_name: 'Org',
  status:            'Status',
  created_at:        'Created',
  last_login:        'Last Login',
};

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Sanitize error messages before displaying to the user.
 * Prevents backend internals (SQL, stack traces, constraint names) leaking to the browser.
 */
function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Truncate suspiciously long messages that may contain server internals
    return msg.length > 200
      ? 'An unexpected error occurred. Please try again.'
      : msg;
  }
  return 'An unexpected error occurred. Please try again.';
}

function statusBadge(s: string) {
  if (s === 'active')    return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20';
  if (s === 'suspended') return 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20';
  return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function CollegeAdminsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [admins,     setAdmins]     = useState<OrgAdmin[]>([]);
  const [orgs,       setOrgs]       = useState<Organization[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search,     setSearch]     = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form,       setForm]       = useState<CreateAdminForm>({
    organization_id: '', email: '', full_name: '', phone: '',
  });
  const [creating,  setCreating]  = useState(false);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [sortKey,   setSortKey]   = useState<SortKey>('created_at');
  const [sortDir,   setSortDir]   = useState<SortDir>('desc');

  /** Guards stale state updates after unmount */
  const abortRef       = useRef<AbortController | null>(null);
  /** Prevents success-toast timer from firing after unmount */
  const successTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSearch = useDebounce(search, 250);

  // ── Success flash (auto-dismisses after 3.5 s) ──────────────────────────
  const flashSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(''), 3500);
  }, []);

  // ── Data loader ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    // Cancel any in-flight guard from a previous call
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      /**
       * UPGRADE: Promise.allSettled instead of Promise.all.
       * If the orgs endpoint times out, the admins list still renders.
       * If admins fail, error is shown but the orgs dropdown still populates
       * for any subsequent create attempt after retry.
       */
      const [adminsResult, orgsResult] = await Promise.allSettled([
        api.listOrgAdmins<{ admins: OrgAdmin[] }>(),
        api.listOrganizations<{ organizations: Organization[] }>('page_size=200'),
      ]);

      // Abort guard: skip state updates if component unmounted during await
      if (ctrl.signal.aborted) return;

      if (adminsResult.status === 'fulfilled') {
        setAdmins(adminsResult.value.admins ?? []);
      } else {
        setError(sanitizeError(adminsResult.reason));
      }

      if (orgsResult.status === 'fulfilled') {
        setOrgs(orgsResult.value.organizations ?? []);
      }
      // orgs failure is non-critical: admins list still renders;
      // only the Create form dropdown is affected, and it shows a warning.
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // ── Unmount cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // ── Auth guard + initial load ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_admin) { router.push('/dashboard'); return; }
    loadData();
  }, [authLoading, user, router, loadData]);

  // ── Escape key: close create modal ───────────────────────────────────────
  useEffect(() => {
    if (!showCreate) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCreate(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreate]);

  // ── Filtered + sorted admins (memoized) ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    let result = q
      ? admins.filter(a =>
          a.email.toLowerCase().includes(q)                  ||
          (a.full_name?.toLowerCase().includes(q) ?? false)  ||
          a.organization_name.toLowerCase().includes(q)      ||
          a.org_code.toLowerCase().includes(q)               // ADDED: search by org code
        )
      : admins;

    // Client-side sort — no extra API call required
    result = [...result].sort((a, b) => {
      const av = (a[sortKey as keyof OrgAdmin] ?? '').toString().toLowerCase();
      const bv = (b[sortKey as keyof OrgAdmin] ?? '').toString().toLowerCase();
      const cmp = av.localeCompare(bv, 'en', { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [admins, debouncedSearch, sortKey, sortDir]);

  // ── Stats summary (memoized) ─────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     admins.length,
    active:    admins.filter(a => a.status === 'active').length,
    suspended: admins.filter(a => a.status === 'suspended').length,
    other:     admins.filter(a => a.status !== 'active' && a.status !== 'suspended').length,
  }), [admins]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  // ── Create admin ──────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.organization_id || !form.email.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.createOrgAdmin({
        organization_id: form.organization_id,
        email:           form.email.trim(),
        full_name:       form.full_name || null,
        phone:           form.phone || null,
      });
      setForm({ organization_id: '', email: '', full_name: '', phone: '' });
      setShowCreate(false);
      flashSuccess('Admin assigned successfully.');
      await loadData();
    } catch (err) {
      setError(sanitizeError(err));
    } finally {
      setCreating(false);
    }
  };

  // ── Toggle enable / disable (optimistic update) ───────────────────────────
  const handleToggle = async (admin: OrgAdmin) => {
    setActionId(admin.id);
    setError(''); // Clear any stale error from a previous action

    const newStatus = admin.status === 'active' ? 'suspended' : 'active';

    /**
     * UPGRADE: Optimistic update.
     * Apply the status change immediately in local state so the UI responds
     * within one frame. Revert to the original status if the API call fails.
     * This eliminates the full loadData() round-trip (admins + orgs) on every toggle.
     */
    setAdmins(prev =>
      prev.map(a => a.id === admin.id ? { ...a, status: newStatus } : a)
    );

    try {
      if (admin.status === 'active') {
        await api.disableOrgAdmin(admin.id);
      } else {
        await api.enableOrgAdmin(admin.id);
      }
      flashSuccess(
        `${admin.full_name || admin.email} has been ${newStatus === 'active' ? 'enabled' : 'disabled'}.`
      );
    } catch (err) {
      // Revert optimistic change on failure
      setAdmins(prev =>
        prev.map(a => a.id === admin.id ? { ...a, status: admin.status } : a)
      );
      setError(sanitizeError(err));
    } finally {
      setActionId(null);
    }
  };

  // ── Auth loading / unauthorized guard ────────────────────────────────────
  if (authLoading || !user || !user.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ── Page header ── */}
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
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-primary !px-5 !py-2.5 text-sm"
            >
              <span className="inline-flex items-center gap-2"><PlusIcon size={16} />Add Admin</span>
            </button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        {!loading && admins.length > 0 && (
          <div className="mb-6 flex gap-3 flex-wrap fade-in">
            {[
              { label: 'Total',     value: stats.total,     color: 'text-slate-300'  },
              { label: 'Active',    value: stats.active,    color: 'text-emerald-400' },
              { label: 'Suspended', value: stats.suspended, color: 'text-rose-400'   },
              ...(stats.other > 0
                ? [{ label: 'Pending', value: stats.other, color: 'text-amber-400' }]
                : []),
            ].map(s => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 flex items-center gap-2"
              >
                <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Error notification (dismissible) ── */}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Dismiss error"
              className="shrink-0 text-rose-400 hover:text-rose-300 transition-colors"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}

        {/* ── Success notification (auto-dismisses) ── */}
        {successMsg && (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {successMsg}
          </div>
        )}

        {/* ── Search + Sort toolbar ── */}
        <div className="mb-6 slide-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email, name, organization, or code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Sort controls */}
          {admins.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 mr-1">Sort:</span>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSort(key)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-medium transition-colors ${
                    sortKey === key
                      ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300'
                  }`}
                >
                  {SORT_LABELS[key]}
                  {sortKey === key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Create Admin Modal ── */}
        {showCreate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          >
            <div
              className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Assign College Admin</h2>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  aria-label="Close modal"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Organization *
                  </label>
                  <select
                    value={form.organization_id}
                    onChange={e => setForm(f => ({ ...f, organization_id: e.target.value }))}
                    required
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900"
                  >
                    <option value="" disabled>Select a college…</option>
                    {orgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name} ({o.org_code})</option>
                    ))}
                  </select>
                  {/* Warn if orgs failed to load */}
                  {orgs.length === 0 && !loading && (
                    <p className="mt-1.5 text-xs text-amber-400">
                      No organizations available. Try refreshing the page or check your permissions.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    User Email *
                  </label>
                  <input
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    type="email"
                    required
                    placeholder="Must be an existing PrepVista account"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Full Name
                    </label>
                    <input
                      value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Phone
                    </label>
                    <input
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="btn-secondary flex-1 !py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn-primary flex-1 !py-2.5"
                  >
                    {creating ? 'Assigning…' : 'Assign Admin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Admin list ── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-16 text-center text-slate-500">
            {debouncedSearch.trim()
              ? `No admins match "${debouncedSearch.trim()}".`
              : 'No college admins created yet.'}
          </div>
        ) : (
          <div className="space-y-3 slide-up">
            {filtered.map(admin => (
              <div
                key={admin.id}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-white/[0.05] transition-colors backdrop-blur-sm"
              >
                {/* Left: identity */}
                <div className="flex items-center gap-4">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400">
                    <UsersIcon size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{admin.full_name || 'College Admin'}</div>
                    <div className="text-xs text-slate-400">{admin.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {admin.organization_name}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{admin.org_code}</span>
                    </div>
                  </div>
                </div>

                {/* Right: dates, status, action */}
                <div className="flex items-center gap-3">
                  <div className="text-right mr-2">
                    <div className="text-xs text-slate-500">Last login: {formatDate(admin.last_login)}</div>
                    <div className="text-xs text-slate-500">Created: {formatDate(admin.created_at)}</div>
                  </div>

                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadge(admin.status)}`}>
                    {admin.status}
                  </span>

                  <button
                    type="button"
                    disabled={actionId === admin.id}
                    onClick={() => handleToggle(admin)}
                    aria-label={
                      admin.status === 'active'
                        ? `Disable ${admin.full_name || admin.email}`
                        : `Enable ${admin.full_name || admin.email}`
                    }
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      admin.status === 'active'
                        ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    } disabled:opacity-50`}
                  >
                    {actionId === admin.id
                      ? (admin.status === 'active' ? 'Disabling…' : 'Enabling…')
                      : admin.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Result count footer ── */}
        {!loading && admins.length > 0 && (
          <p className="mt-4 text-center text-xs text-slate-600">
            Showing {filtered.length} of {admins.length} admin{admins.length !== 1 ? 's' : ''}
            {debouncedSearch.trim() ? ` matching "${debouncedSearch.trim()}"` : ''}
          </p>
        )}

      </div>
    </div>
  );
}