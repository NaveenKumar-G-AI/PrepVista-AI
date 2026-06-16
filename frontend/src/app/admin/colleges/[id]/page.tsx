'use client';
/**
 * PrepVista — Admin: College Detail
 * Tabbed view: Students | Analytics | Billing | Admins for a specific college.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { ArrowLeftIcon, BuildingIcon, ChartIcon, CreditCardIcon, UsersIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type TabId = 'students' | 'analytics' | 'billing' | 'admins';

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function statusBadge(s: string) {
  if (s === 'active') return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20';
  if (s === 'suspended') return 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20';
  return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
}

function StatCard({ label, value, helper, accent = 'blue' }: { label: string; value: string | number; helper: string; accent?: string }) {
  const ring: Record<string, string> = { blue: 'from-blue-500/20 to-blue-600/5 ring-blue-500/15', emerald: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15', violet: 'from-violet-500/20 to-violet-600/5 ring-violet-500/15', amber: 'from-amber-500/20 to-amber-600/5 ring-amber-500/15' };
  const text: Record<string, string> = { blue: 'text-blue-400', emerald: 'text-emerald-400', violet: 'text-violet-400', amber: 'text-amber-400' };
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${ring[accent] || ring.blue} p-6 ring-1 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]`}>
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/[0.03]" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-3 text-4xl font-bold tracking-tight ${text[accent] || text.blue}`}>{value}</div>
      <div className="mt-2 text-[13px] text-slate-500">{helper}</div>
    </div>
  );
}

export default function CollegeDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orgId = params.id as string;
  const [tab, setTab] = useState<TabId>('students');
  const [orgData, setOrgData] = useState<any>(null);
  const [students, setStudents] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [showAssignPlan, setShowAssignPlan] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [billingAction, setBillingAction] = useState<string | null>(null);
  const [billingMsg, setBillingMsg] = useState('');
  const [planForm, setPlanForm] = useState({ plan: 'college_standard', seat_limit: 50, billing_type: 'annual', amount_paise: 0 });
  const [paymentForm, setPaymentForm] = useState({ amount_paise: 0, plan: 'college_standard', billing_type: 'annual', notes: '' });

  const loadOrg = useCallback(async () => {
    try {
      const res = await api.getOrganization<any>(orgId);
      setOrgData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load college.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadStudents = useCallback(async () => {
    try {
      const res = await api.getOrgStudentsAdmin<any>(orgId, `page=${studentPage}&page_size=20`);
      setStudents(res);
    } catch { /* silent */ }
  }, [orgId, studentPage]);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await api.getOrgAnalyticsAdmin<any>(orgId);
      setAnalytics(res);
    } catch { /* silent */ }
  }, [orgId]);

  const loadBilling = useCallback(async () => {
    try {
      const res = await api.getOrgBillingAdmin<any>(orgId);
      setBilling(res);
    } catch { /* silent */ }
  }, [orgId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_admin) { router.push('/dashboard'); return; }
    loadOrg();
  }, [authLoading, user, router, loadOrg]);

  useEffect(() => { if (tab === 'students') loadStudents(); }, [tab, loadStudents]);
  useEffect(() => { if (tab === 'analytics') loadAnalytics(); }, [tab, loadAnalytics]);
  useEffect(() => { if (tab === 'billing') loadBilling(); }, [tab, loadBilling]);

  // Block rendering until auth resolves AND user is confirmed admin
  if (authLoading || loading || !user?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  const org = orgData?.organization;
  const admins = orgData?.admins || [];
  const tabs: { id: TabId; label: string; icon: typeof UsersIcon }[] = [
    { id: 'students', label: 'Students', icon: UsersIcon },
    { id: 'analytics', label: 'Analytics', icon: ChartIcon },
    { id: 'billing', label: 'Billing', icon: CreditCardIcon },
    { id: 'admins', label: 'Admins', icon: BuildingIcon },
  ];

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {error && <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

        {/* Back + Header */}
        <div className="mb-6 fade-in">
          <Link href="/admin/colleges" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-4">
            <ArrowLeftIcon size={16} /> Back to Colleges
          </Link>
          {org && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-500/15 text-blue-400">
                  <BuildingIcon size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-white">{org.name}</h1>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadge(org.status)}`}>{org.status}</span>
                  </div>
                  <p className="text-sm text-slate-400">Code: <span className="font-mono text-white">{org.org_code}</span> · Students: {orgData.student_count} · Career Access: {orgData.active_access_count}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                {org.contact_email && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{org.contact_email}</span>}
                {org.contact_phone && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{org.contact_phone}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-1 mb-6 slide-up">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${tab === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="fade-in">
          {tab === 'students' && (
            <div>
              {!students ? (
                <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /></div>
              ) : students.students.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center text-slate-500">No students enrolled yet.</div>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02]">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/[0.06] bg-white/[0.01] text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <tr>
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3">Code</th>
                        <th className="px-6 py-3">Department</th>
                        <th className="px-6 py-3">Year</th>
                        <th className="px-6 py-3">Access</th>
                        <th className="px-6 py-3">Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {students.students.map((s: any) => (
                        <tr key={s.id} className="hover:bg-white/[0.02]">
                          <td className="px-6 py-3">
                            <div className="font-semibold text-white">{s.full_name || 'Unnamed'}</div>
                            <div className="text-xs text-slate-400">{s.email}</div>
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-slate-400">{s.student_code || '—'}</td>
                          <td className="px-6 py-3 text-slate-300">{s.department_name || '—'}</td>
                          <td className="px-6 py-3 text-slate-300">{s.year_name || '—'}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.has_career_access ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                              {s.has_career_access ? 'Granted' : 'None'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-400">{formatDate(s.added_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <div>
              {!analytics ? (
                <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /></div>
              ) : (
                <div className="space-y-8">
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Total Students" value={analytics.total_students} helper="Active enrolled students" accent="blue" />
                    <StatCard label="Career Access" value={analytics.career_access_students} helper="With Career plan granted" accent="emerald" />
                    <StatCard label="Departments" value={analytics.department_stats?.length || 0} helper="Active departments" accent="violet" />
                    <StatCard label="Year Groups" value={analytics.year_stats?.length || 0} helper="Year segments" accent="amber" />
                  </div>
                  {analytics.department_stats?.length > 0 && (
                    <div className="card p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Department Breakdown</h3>
                      <div className="space-y-3">
                        {analytics.department_stats.map((d: any) => (
                          <div key={d.department_name} className="flex items-center gap-4">
                            <div className="w-40 text-sm text-slate-300 truncate">{d.department_name}</div>
                            <div className="flex-1 h-3 rounded-full bg-slate-800/80 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all" style={{ width: `${Math.max(5, (d.total / Math.max(analytics.total_students, 1)) * 100)}%` }} />
                            </div>
                            <div className="text-sm text-white font-semibold w-16 text-right">{d.total} <span className="text-slate-400 font-normal text-xs">({d.with_access} access)</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'billing' && (
            <div>
              {!billing ? (
                <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /></div>
              ) : (
                <div className="space-y-6">
                  {/* Stats */}
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Current Plan" value={billing.organization?.plan || 'None'} helper="Assigned billing plan" accent="blue" />
                    <StatCard label="Seat Limit" value={billing.organization?.seat_limit || 0} helper="Maximum allowed students" accent="emerald" />
                    <StatCard label="Total Students" value={billing.total_students ?? 0} helper="Currently enrolled" accent="amber" />
                    <StatCard label="Career Access" value={billing.career_access_count ?? 0} helper="Students with career plan" accent="violet" />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => setShowAssignPlan(true)}
                      className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all">
                      Assign Plan
                    </button>
                    <button type="button" onClick={() => setShowRecordPayment(true)}
                      className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all">
                      Record Payment
                    </button>
                    <button type="button" disabled={billingAction !== null}
                      onClick={async () => {
                        if (!confirm(`Grant Career access to ALL students in this college?`)) return;
                        setBillingAction('grant');
                        try {
                          const res = await api.grantAllOrgAccess<any>(orgId);
                          setBillingMsg(res.message || 'Access granted.');
                          loadBilling();
                        } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
                        finally { setBillingAction(null); }
                      }}
                      className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-5 py-2.5 text-sm font-semibold text-violet-400 hover:bg-violet-500/20 transition-all disabled:opacity-50">
                      {billingAction === 'grant' ? 'Granting...' : 'Grant All Access'}
                    </button>
                    <button type="button" disabled={billingAction !== null}
                      onClick={async () => {
                        if (!confirm(`REVOKE Career access from ALL students in this college? They will be set to Free plan.`)) return;
                        setBillingAction('revoke');
                        try {
                          const res = await api.revokeAllOrgAccess<any>(orgId);
                          setBillingMsg(res.message || 'Access revoked.');
                          loadBilling();
                        } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
                        finally { setBillingAction(null); }
                      }}
                      className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/20 transition-all disabled:opacity-50">
                      {billingAction === 'revoke' ? 'Revoking...' : 'Revoke All Access'}
                    </button>
                    <button type="button" disabled={billingAction !== null}
                      onClick={async () => {
                        if (!confirm(`REVOKE the entire college plan? This will also remove Career access from all students.`)) return;
                        setBillingAction('revokePlan');
                        try {
                          const res = await api.revokeOrgPlan<any>(orgId);
                          setBillingMsg(res.message || 'Plan revoked.');
                          loadBilling(); loadOrg();
                        } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
                        finally { setBillingAction(null); }
                      }}
                      className="rounded-2xl border border-rose-500/30 bg-rose-500/15 px-5 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/25 transition-all disabled:opacity-50">
                      {billingAction === 'revokePlan' ? 'Revoking...' : 'Revoke Entire Plan'}
                    </button>
                  </div>

                  {billingMsg && (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{billingMsg}</div>
                  )}

                  {/* Assign Plan Modal */}
                  {showAssignPlan && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAssignPlan(false)}>
                      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-semibold text-white mb-6">Assign Plan</h2>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          setBillingAction('assign');
                          try {
                            const res = await api.assignOrgPlan<any>(orgId, planForm);
                            setBillingMsg(res.message || 'Plan assigned.');
                            setShowAssignPlan(false);
                            loadBilling(); loadOrg();
                          } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
                          finally { setBillingAction(null); }
                        }} className="space-y-4">
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Plan</label>
                            <select value={planForm.plan} onChange={e => setPlanForm(f => ({...f, plan: e.target.value}))}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
                              <option value="college_standard">College Standard</option>
                              <option value="college_pilot">College Pilot</option>
                              <option value="college_pro">College Pro</option>
                              <option value="college_custom">College Custom</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Seat Limit</label>
                              <input type="number" min={1} value={planForm.seat_limit} onChange={e => setPlanForm(f => ({...f, seat_limit: Number(e.target.value)}))}
                                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Billing Type</label>
                              <select value={planForm.billing_type} onChange={e => setPlanForm(f => ({...f, billing_type: e.target.value}))}
                                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
                                <option value="annual">Annual</option>
                                <option value="monthly">Monthly</option>
                                <option value="per_student">Per Student</option>
                                <option value="batch">Batch</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Amount (₹)</label>
                            <input type="number" min={0} value={planForm.amount_paise / 100} onChange={e => setPlanForm(f => ({...f, amount_paise: Math.round(Number(e.target.value) * 100)}))}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                          </div>
                          <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAssignPlan(false)} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                            <button type="submit" disabled={billingAction === 'assign'} className="btn-primary flex-1 !py-2.5">
                              {billingAction === 'assign' ? 'Assigning...' : 'Assign & Grant Access'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* Record Payment Modal */}
                  {showRecordPayment && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRecordPayment(false)}>
                      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-semibold text-white mb-6">Record Manual Payment</h2>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          setBillingAction('payment');
                          try {
                            const res = await api.recordOrgPayment<any>(orgId, paymentForm);
                            setBillingMsg(res.message || 'Payment recorded.');
                            setShowRecordPayment(false);
                            setPaymentForm({ amount_paise: 0, plan: 'college_standard', billing_type: 'annual', notes: '' });
                            loadBilling();
                          } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
                          finally { setBillingAction(null); }
                        }} className="space-y-4">
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Amount (₹) *</label>
                            <input type="number" min={1} required value={paymentForm.amount_paise / 100 || ''} onChange={e => setPaymentForm(f => ({...f, amount_paise: Math.round(Number(e.target.value) * 100)}))}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Plan</label>
                            <select value={paymentForm.plan} onChange={e => setPaymentForm(f => ({...f, plan: e.target.value}))}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
                              <option value="college_standard">College Standard</option>
                              <option value="college_pilot">College Pilot</option>
                              <option value="college_pro">College Pro</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Notes</label>
                            <textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({...f, notes: e.target.value}))} rows={2}
                              placeholder="Bank transfer, cheque number, etc."
                              className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                          </div>
                          <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowRecordPayment(false)} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                            <button type="submit" disabled={billingAction === 'payment'} className="btn-primary flex-1 !py-2.5">
                              {billingAction === 'payment' ? 'Recording...' : 'Record Payment'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* Plan Allocations Table */}
                  {billing.allocations?.length > 0 && (
                    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Plan Allocations</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                            <tr><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Seats</th><th className="px-4 py-2">Billing</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Created</th></tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {billing.allocations.map((a: any, i: number) => (
                              <tr key={i} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-2 text-white font-semibold">{a.plan}</td>
                                <td className="px-4 py-2 text-slate-300">{a.seat_limit}</td>
                                <td className="px-4 py-2 text-slate-300">{a.billing_type}</td>
                                <td className="px-4 py-2 text-slate-300">{a.amount_paise ? `₹${(a.amount_paise / 100).toFixed(2)}` : '—'}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>{a.status}</span>
                                </td>
                                <td className="px-4 py-2 text-slate-400 text-xs">{formatDate(a.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Payment History Table */}
                  {billing.payments?.length > 0 && (
                    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Payment History</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                            <tr><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Payment ID</th><th className="px-4 py-2">Date</th></tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {billing.payments.map((p: any) => (
                              <tr key={p.id} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-2 text-white font-semibold">₹{(p.amount_paise / 100).toFixed(2)}</td>
                                <td className="px-4 py-2 text-slate-300">{p.plan}</td>
                                <td className="px-4 py-2 text-slate-300 capitalize">{p.provider}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.status === 'verified' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{p.status}</span>
                                </td>
                                <td className="px-4 py-2 font-mono text-xs text-slate-400">{p.razorpay_payment_id || p.notes || '—'}</td>
                                <td className="px-4 py-2 text-slate-400 text-xs">{formatDate(p.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'admins' && (
            <div>
              {admins.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center text-slate-500">
                  No admins assigned to this college. <Link href="/admin/college-admins" className="text-blue-400 hover:underline">Assign one here</Link>.
                </div>
              ) : (
                <div className="space-y-3">
                  {admins.map((a: any) => (
                    <div key={a.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-4 flex items-center justify-between hover:bg-white/[0.05] transition-colors">
                      <div>
                        <div className="font-semibold text-white">{a.full_name || 'College Admin'}</div>
                        <div className="text-xs text-slate-400">{a.email} · Role: {a.role}</div>
                        <div className="text-xs text-slate-500 mt-1">Last login: {formatDateTime(a.last_login)}</div>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadge(a.status)}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
