'use client';
/**
 * PrepVista — Org Admin: Companies & Recruiters (Part 2 Integration)
 * Full company CRM list with search, stage filter, and repeat-recruiter toggle.
 * Route: /org-admin/companies
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  relationship_stage: string;
  headquarters_city: string | null;
  website: string | null;
  is_repeat_recruiter: boolean;
  created_at: string;
  updated_at: string;
}

interface CompaniesResponse {
  items: Company[];
  total: number;
  page: number;
  page_size: number;
}

const STAGE_LABELS: Record<string, string> = {
  PROSPECT:              'Prospect',
  CONTACTED:             'Contacted',
  INTERESTED:            'Interested',
  REQUIREMENT_RECEIVED:  'Req. Received',
  DRIVE_SCHEDULED:       'Drive Scheduled',
  DRIVE_COMPLETED:       'Drive Completed',
  HIRING:                'Hiring',
  REPEAT_RECRUITER:      'Repeat Recruiter',
  INACTIVE:              'Inactive',
};

const STAGE_COLORS: Record<string, string> = {
  PROSPECT:              'bg-slate-500/15 text-slate-400',
  CONTACTED:             'bg-blue-500/15 text-blue-400',
  INTERESTED:            'bg-violet-500/15 text-violet-400',
  REQUIREMENT_RECEIVED:  'bg-amber-500/15 text-amber-400',
  DRIVE_SCHEDULED:       'bg-orange-500/15 text-orange-400',
  DRIVE_COMPLETED:       'bg-emerald-500/15 text-emerald-400',
  HIRING:                'bg-emerald-500/20 text-emerald-300',
  REPEAT_RECRUITER:      'bg-teal-500/20 text-teal-300',
  INACTIVE:              'bg-slate-600/15 text-slate-500',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [items, setItems]           = useState<Company[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [stage, setStage]           = useState('');
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [page, setPage]             = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newSite, setNewSite] = useState('');
  const [adding, setAdding]   = useState(false);
  const [addErr, setAddErr]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | boolean | number> = { page };
      if (search)     params.search      = search;
      if (stage)      params.stage       = stage;
      if (repeatOnly) params.repeat_only = true;
      const res = await api.listRecruiterCompanies<CompaniesResponse>(params);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setError('Failed to load companies. The recruiter CRM may not be set up yet.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, stage, repeatOnly, page]);

  useEffect(() => {
    const h = setTimeout(load, 300);
    return () => clearTimeout(h);
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setAddErr(null);
    try {
      await api.createRecruiterCompany({
        name: newName.trim(),
        headquarters_city: newCity.trim() || undefined,
        website: newSite.trim() || undefined,
      });
      setNewName(''); setNewCity(''); setNewSite('');
      setShowAdd(false);
      load();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setAddErr(e.message ?? 'Failed to add company');
    } finally {
      setAdding(false);
    }
  }

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/org-admin" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
                Dashboard
              </Link>
              <span className="text-slate-600 text-xs">/</span>
              <span className="text-xs text-slate-400">Companies</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Companies &amp; Recruiters</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading ? 'Loading\u2026' : `${total} compan${total === 1 ? 'y' : 'ies'} in your CRM`}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            <span>+</span> Add company
          </button>
        </div>

        {/* Add Company Modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="card !p-6 w-full max-w-md mx-4">
              <h2 className="text-base font-semibold text-white mb-4">Add Company</h2>
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Company name *</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Infosys"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">City</label>
                  <input
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    placeholder="e.g. Bengaluru"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Website</label>
                  <input
                    value={newSite}
                    onChange={e => setNewSite(e.target.value)}
                    placeholder="https://company.com"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                  />
                </div>
                {addErr && <p className="text-xs text-rose-400">{addErr}</p>}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAdd(false); setAddErr(null); }}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] py-2 text-sm text-slate-400 hover:bg-white/[0.07] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="flex-1 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-2 text-sm font-semibold text-white transition-colors"
                  >
                    {adding ? 'Adding\u2026' : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">&#x1F50D;</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search companies\u2026"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <select
            value={stage}
            onChange={e => { setStage(e.target.value); setPage(1); }}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">All stages</option>
            {Object.entries(STAGE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={repeatOnly}
              onChange={e => { setRepeatOnly(e.target.checked); setPage(1); }}
              className="rounded"
            />
            Repeat recruiters only
          </label>
        </div>

        {/* Content */}
        {error ? (
          <div className="card !p-8 text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-blue-400 hover:underline">Retry</button>
          </div>
        ) : loading ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card !p-12 text-center">
            <div className="text-4xl mb-3">&#x1F3E2;</div>
            <p className="text-sm font-semibold text-white">No companies yet</p>
            <p className="text-xs text-slate-500 mt-1">Add your first recruiter company to start tracking your CRM pipeline.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 inline-flex items-center gap-1 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 transition-colors"
            >
              + Add company
            </button>
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">City</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {items.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {c.name}
                        {c.is_repeat_recruiter && (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-teal-400 bg-teal-500/15 rounded-full px-2 py-0.5">
                            Repeat
                          </span>
                        )}
                      </div>
                      {c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          {c.website.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">
                      {c.headquarters_city || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_COLORS[c.relationship_stage] ?? 'bg-slate-500/15 text-slate-400'}`}>
                        {STAGE_LABELS[c.relationship_stage] ?? c.relationship_stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Page {page} of {totalPages} \u2014 {total} total</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
              >
                \u2190 Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
              >
                Next \u2192
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
