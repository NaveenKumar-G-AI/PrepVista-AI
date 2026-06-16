'use client';
/**
 * PrepVista — College Admin: Access Control
 * Seat management, grant/revoke career access, access log.
 */

import { useEffect, useState, useCallback } from 'react';
import { KeyIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useOrgContext } from '../layout';

interface AccessData {
  total_seats: number;
  used_seats: number;
  available_seats: number;
  career_access_count: number;
  students_without_access: Array<{ id: string; student_code: string | null; email: string; full_name: string | null; department_name: string | null; year_name: string | null }>;
  students_with_access: Array<{ id: string; student_code: string | null; email: string; full_name: string | null; department_name: string | null; year_name: string | null; access_granted_at: string | null }>;
  recent_access_log: Array<{ id: string; action: string; student_email: string | null; created_at: string }>;
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AccessControlPage() {
  const { refreshOrg } = useOrgContext();
  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getCollegeAccessControl<AccessData>();
      setData(res);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGrant = async (studentId: string) => {
    setActionId(studentId); setError('');
    try { await api.grantCareerAccess(studentId); await load(); refreshOrg(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setActionId(null); }
  };

  const handleRevoke = async (studentId: string) => {
    setActionId(studentId); setError('');
    try { await api.revokeCareerAccess(studentId); await load(); refreshOrg(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setActionId(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" /></div>;

  const seatPct = data ? Math.min(100, data.total_seats ? (data.used_seats / data.total_seats) * 100 : 0) : 0;

  return (
    <div className="space-y-6">
      <div className="fade-in">
        <h1 className="text-2xl font-bold text-white">Access Control</h1>
        <p className="text-sm text-slate-400">Manage career access for your students</p>
      </div>

      {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

      {data && (
        <>
          {/* Seat Meter */}
          <div className="card !p-6 slide-up">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-white">Seat Utilization</div>
              <div className="text-sm text-slate-400">
                <span className="text-white font-bold">{data.used_seats}</span> / {data.total_seats} used · <span className="text-emerald-400 font-semibold">{data.available_seats}</span> available
              </div>
            </div>
            <div className="h-4 rounded-full bg-slate-800/80 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${seatPct > 90 ? 'bg-gradient-to-r from-rose-500 to-red-500' : seatPct > 70 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
                style={{ width: `${Math.max(2, seatPct)}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Career access granted to <span className="text-emerald-400 font-semibold">{data.career_access_count}</span> student{data.career_access_count !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 slide-up">
            {/* Without Access */}
            <div className="card !p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Without Career Access ({data.students_without_access.length})</h3>
              {data.students_without_access.length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center">All students have access</div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {data.students_without_access.map(s => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <div>
                        <div className="text-sm font-semibold text-white">{s.full_name || 'Unnamed'}</div>
                        <div className="text-xs text-slate-400">{s.email}{s.department_name ? ` · ${s.department_name}` : ''}</div>
                      </div>
                      <button type="button" disabled={actionId === s.id} onClick={() => handleGrant(s.id)}
                        className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
                        {actionId === s.id ? '...' : 'Grant'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* With Access */}
            <div className="card !p-5">
              <h3 className="text-sm font-semibold text-white mb-3">With Career Access ({data.students_with_access.length})</h3>
              {data.students_with_access.length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center">No students have career access yet</div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {data.students_with_access.map(s => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <div>
                        <div className="text-sm font-semibold text-white">{s.full_name || 'Unnamed'}</div>
                        <div className="text-xs text-slate-400">{s.email} · Granted: {formatDate(s.access_granted_at)}</div>
                      </div>
                      <button type="button" disabled={actionId === s.id} onClick={() => handleRevoke(s.id)}
                        className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                        {actionId === s.id ? '...' : 'Revoke'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Access Log */}
          {data.recent_access_log.length > 0 && (
            <div className="card !p-6 slide-up">
              <h3 className="text-sm font-semibold text-white mb-4">Recent Access Log</h3>
              <div className="space-y-2">
                {data.recent_access_log.map(log => (
                  <div key={log.id} className="flex items-center justify-between border-b border-white/[0.04] pb-2 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${log.action === 'grant_access' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        {log.action === 'grant_access' ? 'Grant' : 'Revoke'}
                      </span>
                      <span className="text-sm text-slate-300">{log.student_email || '—'}</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDate(log.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
