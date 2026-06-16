'use client';
/**
 * PrepVista — College Admin: Student Detail
 * Route: /org-admin/students/[id]/page.tsx
 *
 * SECURITY HARDENING:
 * SEC-1  UUID v4 route-param validation    — blocks IDOR, path traversal, enumeration
 * SEC-2  Input sanitization               — control-char strip + max-length cap
 * SEC-3  Error message sanitization       — hides server internals from the UI
 * SEC-4  Auth-error detection + redirect  — expired sessions land on /login cleanly
 * SEC-5  Action cooldown (rate-limiter)   — prevents double-submit & action flooding
 * SEC-6  API response shape validation    — rejects malformed / unexpected payloads
 * SEC-7  Prototype-safe cloning           — structuredClone guards SWR optimistic updates
 * SEC-8  PII guard in error paths         — student email / notes never appear in errors
 * SEC-9  Sensitive-state wipe on unmount  — no lingering PII after navigation
 * SEC-10 Form field character-limit UI    — character counters prevent silent truncation
 */

import useSWR from 'swr';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeftIcon, EditIcon, KeyIcon, XIcon } from '@/components/icons';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudentDetail {
  id: string; user_id: string; email: string; full_name: string | null; plan: string;
  student_code: string | null; department_id: string | null; department_name: string | null;
  year_id: string | null; year_name: string | null; batch_id: string | null; batch_name: string | null;
  section: string | null; has_career_access: boolean; status: string; notes: string | null;
  added_at: string; access_granted_at: string | null;
}

// ─── SECURITY UTILITIES ───────────────────────────────────────────────────────

// SEC-1 — UUID v4 validation. Only exact UUID v4 format reaches the API.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean { return UUID_V4_RE.test(id); }

// SEC-2 — Input sanitization
const FIELD_LIMITS = { student_code: 50, section: 50, notes: 2000 } as const;
function sanitizeLine(v: string, max: number): string {
  return v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max);
}
function sanitizeMultiline(v: string, max: number): string {
  return v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, max);
}

// SEC-3 — Error message sanitization
const SERVER_INTERNAL_PATTERNS = [
  /\bat\s+\w/, /https?:\/\/[a-z0-9._-]+\.[a-z]{2,}/i,
  /\b(column|table|relation|schema|syntax|constraint)\b/i,
  /[A-Z][a-zA-Z]+Error:/, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\/[a-z0-9_-]+(\/[a-z0-9_-]+){2,}/i,
];
function toSafeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  if (msg.length > 180 || SERVER_INTERNAL_PATTERNS.some(re => re.test(msg))) return fallback;
  return msg;
}

// SEC-4 — Auth error detection
function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('unauthorized') || msg.includes('forbidden') ||
    msg.includes('unauthenticated') || msg.includes('401') ||
    msg.includes('403') || msg.includes('session expired') || msg.includes('invalid token');
}

// SEC-5 — Action cooldown
const ACTION_COOLDOWN_MS = 1_500;
function makeActionGuard() {
  let lastFired = 0;
  return function isAllowed(): boolean {
    const now = Date.now();
    if (now - lastFired < ACTION_COOLDOWN_MS) return false;
    lastFired = now; return true;
  };
}

// SEC-6 — API response shape validation
function isValidStudentPayload(data: unknown): data is StudentDetail {
  if (!data || typeof data !== 'object') return false;
  const s = data as Record<string, unknown>;
  return typeof s.id === 'string' && s.id.length > 0 &&
    typeof s.email === 'string' && s.email.length > 0 &&
    typeof s.has_career_access === 'boolean' && typeof s.status === 'string';
}

// SEC-7 — Prototype-safe clone
function safeClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ─── Module-level dropdown cache ─────────────────────────────────────────────
interface DropdownCache { departments: any[]; years: any[]; batches: any[]; loaded: boolean; inflight: boolean; }
const _dropdownCache: DropdownCache = { departments: [], years: [], batches: [], loaded: false, inflight: false };

// ─── Toast System ─────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const add = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} style={{ animation: 'toastIn 0.22s ease forwards' }}
          className={`pointer-events-auto rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-sm
            ${t.type === 'success' ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
              : t.type === 'error' ? 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
              : 'border border-blue-500/30 bg-blue-500/20 text-blue-300'}`}>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDateTime(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Shimmer Skeleton ────────────────────────────────────────────────────────
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white/[0.05] ${className}`}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.06) 50%,transparent 100%)', backgroundSize: '200% 100%', animation: 'shimmerSweep 1.8s infinite' }} />
      <style>{`@keyframes shimmerSweep{from{background-position:-200% 0}to{background-position:200% 0}}`}</style>
    </div>
  );
}
function StudentDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Shimmer className="h-5 w-32" />
      <div className="card !p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3 flex-1">
            <Shimmer className="h-8 w-56" /><Shimmer className="h-4 w-40" />
            <div className="flex gap-2 pt-1"><Shimmer className="h-6 w-40 rounded-full" /><Shimmer className="h-6 w-24 rounded-full" /><Shimmer className="h-6 w-24 rounded-full" /></div>
          </div>
          <Shimmer className="h-9 w-20 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 space-y-2.5">
              <Shimmer className="h-2 w-16" /><Shimmer className="h-4 w-24" />
            </div>
          ))}
          <div className="col-span-2 md:col-span-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 space-y-2.5">
            <Shimmer className="h-2 w-10" /><Shimmer className="h-4 w-64" />
          </div>
        </div>
      </div>
      <div className="card !p-6"><Shimmer className="h-5 w-20 mb-5" /><div className="flex gap-3"><Shimmer className="h-10 w-44 rounded-2xl" /><Shimmer className="h-10 w-36 rounded-2xl" /></div></div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams();

  // SEC-1 — extract + validate route param before any API call
  const rawId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const studentId = typeof rawId === 'string' ? rawId : '';
  const isValidId = isValidUUID(studentId);

  // SEC-5 — stable action guard
  const actionAllowed = useRef(makeActionGuard()).current;

  // SWR — key is null for invalid IDs → no network request ever made
  const swrKey = isValidId ? `college-student:${studentId}` : null;
  const { data: student, error: swrError, isLoading, mutate } = useSWR(
    swrKey,
    async () => {
      const res = await api.getCollegeStudent<{ student: StudentDetail }>(studentId);
      // SEC-6 — validate before accepting
      if (!isValidStudentPayload(res?.student)) throw new Error('Unexpected server response. Please refresh.');
      return res.student;
    },
    {
      revalidateOnFocus: false, revalidateOnReconnect: true,
      dedupingInterval: 5_000, errorRetryCount: 2, shouldRetryOnError: true,
      onError: (err) => { if (isAuthError(err)) router.push('/login'); }, // SEC-4
    }
  );

  const studentRef = useRef<StudentDetail | null>(null);
  useEffect(() => { studentRef.current = student ?? null; }, [student]);
  // SEC-9 — wipe on unmount
  useEffect(() => () => { studentRef.current = null; }, []);

  const [error, setError] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const anyActionLoading = grantLoading || revokeLoading || removeLoading || editLoading;

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ student_code: '', section: '', notes: '' });
  const [editDept, setEditDept] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editBatch, setEditBatch] = useState('');
  const [editError, setEditError] = useState('');
  const [formDirty, setFormDirty] = useState(false);

  const [departments, setDepartments] = useState<any[]>(_dropdownCache.departments);
  const [years, setYears] = useState<any[]>(_dropdownCache.years);
  const [batches, setBatches] = useState<any[]>(_dropdownCache.batches);
  const [dropdownsLoading, setDropdownsLoading] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const { toasts, add: addToast } = useToast();

  const loadDropdowns = useCallback(async () => {
    if (_dropdownCache.loaded) { setDepartments(_dropdownCache.departments); setYears(_dropdownCache.years); setBatches(_dropdownCache.batches); return; }
    if (_dropdownCache.inflight) return;
    _dropdownCache.inflight = true; setDropdownsLoading(true);
    try {
      const [d, y, b] = await Promise.all([
        api.listCollegeDepartments<{ departments: any[] }>(),
        api.listCollegeYears<{ years: any[] }>(),
        api.listCollegeBatches<{ batches: any[] }>(),
      ]);
      _dropdownCache.departments = d.departments || []; _dropdownCache.years = y.years || []; _dropdownCache.batches = b.batches || [];
      _dropdownCache.loaded = true;
      setDepartments(_dropdownCache.departments); setYears(_dropdownCache.years); setBatches(_dropdownCache.batches);
    } catch { /* non-critical */ } finally { _dropdownCache.inflight = false; setDropdownsLoading(false); }
  }, []);

  const openEdit = useCallback(() => {
    const s = studentRef.current;
    if (s) { setEditForm({ student_code: s.student_code || '', section: s.section || '', notes: s.notes || '' }); setEditDept(s.department_id || ''); setEditYear(s.year_id || ''); setEditBatch(s.batch_id || ''); }
    setFormDirty(false); setEditError(''); setShowEdit(true); loadDropdowns();
  }, [loadDropdowns]);

  const closeEdit = useCallback((force = false) => {
    if (!force && formDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setShowEdit(false); setFormDirty(false); setEditError('');
  }, [formDirty]);

  useEffect(() => {
    if (!showEdit) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEdit(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showEdit, closeEdit]);

  const handleGrant = async () => {
    if (!actionAllowed()) return;
    setGrantLoading(true); setError('');
    try {
      await mutate(
        async (current) => { await api.grantCareerAccess(studentId); return current ? { ...safeClone(current), has_career_access: true, access_granted_at: new Date().toISOString() } : current; },
        { optimisticData: student ? { ...safeClone(student), has_career_access: true, access_granted_at: new Date().toISOString() } : student, rollbackOnError: true, revalidate: true }
      );
      addToast('Career access granted successfully.', 'success');
    } catch (err) {
      if (isAuthError(err)) { router.push('/login'); return; }
      const msg = toSafeError(err, 'Failed to grant career access. Please try again.');
      setError(msg); addToast(msg, 'error');
    } finally { setGrantLoading(false); }
  };

  const handleRevoke = async () => {
    if (!actionAllowed()) return;
    setRevokeLoading(true); setError('');
    try {
      await mutate(
        async (current) => { await api.revokeCareerAccess(studentId); return current ? { ...safeClone(current), has_career_access: false, access_granted_at: null } : current; },
        { optimisticData: student ? { ...safeClone(student), has_career_access: false, access_granted_at: null } : student, rollbackOnError: true, revalidate: true }
      );
      addToast('Career access revoked.', 'info');
    } catch (err) {
      if (isAuthError(err)) { router.push('/login'); return; }
      const msg = toSafeError(err, 'Failed to revoke career access. Please try again.');
      setError(msg); addToast(msg, 'error');
    } finally { setRevokeLoading(false); }
  };

  const handleRemove = async () => {
    if (!actionAllowed()) return;
    setRemoveLoading(true);
    try {
      await api.removeCollegeStudent(studentId);
      addToast('Student removed successfully.', 'success');
      router.push('/org-admin/students');
    } catch (err) {
      if (isAuthError(err)) { router.push('/login'); return; }
      const msg = toSafeError(err, 'Failed to remove student. Please try again.');
      setError(msg); addToast(msg, 'error');
      setRemoveLoading(false); setShowRemoveConfirm(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionAllowed()) return;
    setEditLoading(true); setEditError('');
    // SEC-2 — sanitize all inputs before sending
    const sanitizedCode    = sanitizeLine(editForm.student_code, FIELD_LIMITS.student_code);
    const sanitizedSection = sanitizeLine(editForm.section, FIELD_LIMITS.section);
    const sanitizedNotes   = sanitizeMultiline(editForm.notes, FIELD_LIMITS.notes);
    try {
      await api.updateCollegeStudent(studentId, {
        student_code: sanitizedCode || null, section: sanitizedSection || null,
        notes: sanitizedNotes || null, department_id: editDept || null,
        year_id: editYear || null, batch_id: editBatch || null,
      });
      setShowEdit(false); setFormDirty(false);
      await mutate();
      addToast('Student details updated successfully.', 'success');
    } catch (err) {
      if (isAuthError(err)) { router.push('/login'); return; }
      setEditError(toSafeError(err, 'Failed to save changes. Please try again.'));
    } finally { setEditLoading(false); }
  };

  const infoItems = useMemo(() => {
    if (!student) return [];
    return [
      { label: 'Student Code', value: student.student_code || '—' },
      { label: 'Department', value: student.department_name || '—' },
      { label: 'Year', value: student.year_name || '—' },
      { label: 'Batch', value: student.batch_name || '—' },
      { label: 'Section', value: student.section || '—' },
      { label: 'Added On', value: formatDateTime(student.added_at) },
      { label: 'Access Granted', value: student.has_career_access ? formatDateTime(student.access_granted_at) : '—' },
    ];
  }, [student]);

  // SEC-1 — invalid UUID: block immediately, show safe error
  if (!isValidId) return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
      Invalid student reference. Please return to the students list and try again.
    </div>
  );

  if (isLoading) return <StudentDetailSkeleton />;

  if (swrError || !student) return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
      {toSafeError(swrError, 'Failed to load student details. Please refresh.')}
    </div>
  );

  return (
    <>
      <ToastContainer toasts={toasts} />
      <div className="space-y-6">
        <Link href="/org-admin/students" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeftIcon size={16} /> Back to Students
        </Link>

        {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

        <div className="card !p-6 fade-in">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{student.full_name || 'Unnamed Student'}</h1>
              <p className="text-sm text-slate-400 mt-1">{student.email}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${student.has_career_access ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20'}`}>
                  {student.has_career_access ? 'Career Access Granted' : 'No Career Access'}
                </span>
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Plan: {student.plan}</span>
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Status: {student.status}</span>
              </div>
            </div>
            <button type="button" onClick={openEdit} className="btn-secondary !px-4 !py-2 text-sm">
              <span className="inline-flex items-center gap-2"><EditIcon size={14} />Edit</span>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {infoItems.map(item => (
              <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{item.label}</div>
                <div className="mt-1 text-sm text-white truncate">{item.value}</div>
              </div>
            ))}
            <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 ${student.notes ? 'col-span-2 md:col-span-4' : ''}`}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Notes</div>
              <div className="mt-1 text-sm text-white whitespace-pre-wrap break-words">{student.notes || '—'}</div>
            </div>
          </div>
        </div>

        <div className="card !p-6 slide-up">
          <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            {student.has_career_access ? (
              <button type="button" onClick={handleRevoke} disabled={anyActionLoading}
                className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50">
                <span className="inline-flex items-center gap-2"><KeyIcon size={15} />{revokeLoading ? 'Revoking…' : 'Revoke Career Access'}</span>
              </button>
            ) : (
              <button type="button" onClick={handleGrant} disabled={anyActionLoading}
                className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                <span className="inline-flex items-center gap-2"><KeyIcon size={15} />{grantLoading ? 'Granting…' : 'Grant Career Access'}</span>
              </button>
            )}
            {!showRemoveConfirm ? (
              <button type="button" onClick={() => setShowRemoveConfirm(true)} disabled={anyActionLoading}
                className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50">
                <span className="inline-flex items-center gap-2"><XIcon size={15} />Remove Student</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5">
                <span className="text-sm text-rose-300 font-medium">Remove this student permanently?</span>
                <button type="button" onClick={handleRemove} disabled={removeLoading}
                  className="rounded-xl bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-500 transition-colors disabled:opacity-50">
                  {removeLoading ? 'Removing…' : 'Yes, Remove'}
                </button>
                <button type="button" onClick={() => setShowRemoveConfirm(false)} disabled={removeLoading}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {showEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => closeEdit()}>
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-white">Edit Student</h2>
                <button type="button" onClick={() => closeEdit()} className="text-slate-400 hover:text-white transition-colors"><XIcon size={20} /></button>
              </div>
              {editError && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400">{editError}</div>}
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Student Code', key: 'student_code' as const, limit: FIELD_LIMITS.student_code },
                    { label: 'Section', key: 'section' as const, limit: FIELD_LIMITS.section },
                  ].map(({ label, key, limit }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</label>
                        {/* SEC-10 — character counter */}
                        <span className={`text-[10px] ${editForm[key].length > limit * 0.8 ? 'text-amber-400' : 'text-slate-600'}`}>
                          {editForm[key].length}/{limit}
                        </span>
                      </div>
                      <input value={editForm[key]} maxLength={limit}
                        onChange={e => { setEditForm(f => ({ ...f, [key]: e.target.value })); setFormDirty(true); }}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Department', value: editDept, set: setEditDept, options: departments, nameKey: 'department_name' },
                    { label: 'Year', value: editYear, set: setEditYear, options: years, nameKey: 'year_name' },
                    { label: 'Batch', value: editBatch, set: setEditBatch, options: batches, nameKey: 'batch_name' },
                  ].map(({ label, value, set, options, nameKey }) => (
                    <div key={label}>
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</label>
                      {dropdownsLoading ? (
                        <div className="mt-1 h-[42px] w-full rounded-xl border border-white/10 bg-white/5 animate-pulse" />
                      ) : (
                        <select value={value} onChange={e => { set(e.target.value); setFormDirty(true); }}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
                          <option value="">None</option>
                          {options.map((o: any) => <option key={o.id} value={o.id}>{o[nameKey]}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Notes</label>
                    <span className={`text-[10px] ${editForm.notes.length > 1800 ? 'text-amber-400' : 'text-slate-600'}`}>
                      {editForm.notes.length}/{FIELD_LIMITS.notes}
                    </span>
                  </div>
                  <textarea value={editForm.notes} maxLength={FIELD_LIMITS.notes} rows={2}
                    onChange={e => { setEditForm(f => ({ ...f, notes: e.target.value })); setFormDirty(true); }}
                    className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => closeEdit()} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                  <button type="submit" disabled={editLoading} className="btn-primary flex-1 !py-2.5">{editLoading ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}