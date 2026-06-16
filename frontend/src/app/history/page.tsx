'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FileIcon, HistoryIcon, LockIcon, TrashIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getStartInterviewHref, hasRemainingUsage } from '@/lib/plan-usage';

interface HistoryResponse {
  sessions: Array<{
    id: string;
    plan: string;
    score: number | null;
    state: string;
    total_turns: number;
    duration: number | null;
    created_at: string;
    finished_at: string | null;
  }>;
  total: number;
  locked: boolean;
  message?: string;
  lock_reason?: string | null;
  current_feedback_session_id?: string | null;
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [pageError, setPageError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const router = useRouter();
  const startInterviewHref = getStartInterviewHref(user?.usage);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.getSessionHistory<HistoryResponse>()
      .then(setHistory)
      .catch(error => {
        setPageError(error instanceof Error ? error.message : 'History could not be loaded right now.');
      })
      .finally(() => setLoading(false));
  }, [authLoading, router, user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  const sessions = history?.sessions ?? [];
  const deleteCandidate = sessions.find(session => session.id === deleteCandidateId) || null;
  const allVisibleSelected = sessions.length > 0 && sessions.every(session => selectedSessionIds.includes(session.id));

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds(prev => (
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    ));
  };

  const toggleSelectAllVisible = () => {
    if (!sessions.length) {
      return;
    }

    setSelectedSessionIds(prev => {
      if (sessions.every(session => prev.includes(session.id))) {
        return prev.filter(id => !sessions.some(session => session.id === id));
      }

      const merged = new Set(prev);
      sessions.forEach(session => merged.add(session.id));
      return Array.from(merged);
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    if (deletingId) {
      return;
    }

    setActionNotice('');
    setBulkDeleteOpen(false);
    setDeleteCandidateId(sessionId);
  };

  const handleBulkDelete = () => {
    if (deletingId || !selectedSessionIds.length) {
      return;
    }

    setActionNotice('');
    setDeleteCandidateId(null);
    setBulkDeleteOpen(true);
  };

  const confirmDeleteSession = async () => {
    if ((!deleteCandidateId && !selectedSessionIds.length) || deletingId) {
      return;
    }

    const bulkIds = deleteCandidateId ? [] : selectedSessionIds;
    const isBulkDelete = bulkIds.length > 0;
    const activeDeleteId = deleteCandidateId || bulkIds[0];
    setDeletingId(activeDeleteId);
    setActionNotice('');
    try {
      const deletedIds = deleteCandidateId
        ? [deleteCandidateId]
        : (await api.bulkDeleteSessionHistory(bulkIds)).session_ids;

      if (deleteCandidateId) {
        await api.deleteSessionHistory(deleteCandidateId);
      }
      setHistory(prev => {
        if (!prev) {
          return prev;
        }
        const deletedSet = new Set(deletedIds);
        const nextSessions = prev.sessions.filter(session => !deletedSet.has(session.id));
        return {
          ...prev,
          sessions: nextSessions,
          total: Math.max(0, prev.total - deletedIds.length),
        };
      });

      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('pv_interview_session');
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { session_id?: string };
            if (parsed.session_id && deletedIds.includes(parsed.session_id)) {
              sessionStorage.removeItem('pv_interview_session');
            }
          } catch {
            /* ignore malformed local session state */
          }
        }
      }
      setActionNotice(
        isBulkDelete
          ? `${deletedIds.length} interview history item${deletedIds.length === 1 ? '' : 's'} deleted successfully.`
          : 'Interview history item deleted successfully.',
      );
      setDeleteCandidateId(null);
      setBulkDeleteOpen(false);
      setSelectedSessionIds(prev => prev.filter(id => !deletedIds.includes(id)));
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'History deletion failed. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader backHref="/dashboard" backLabel="Back to main" />

      <div className="mx-auto max-w-5xl px-6 py-8">
        {pageError ? (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300">
            {pageError}
          </div>
        ) : null}
        {actionNotice ? (
          <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
            actionNotice.toLowerCase().includes('deleted successfully')
              ? 'border border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300'
          }`}>
            {actionNotice}
          </div>
        ) : null}
        <div className="mb-8 fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <HistoryIcon size={14} />
            Dedicated history page
          </div>
          <h1 className="text-3xl font-bold text-primary">Interview History</h1>
          <p className="mt-2 text-secondary">
            This page only opens when you click History. It keeps the main dashboard lighter while still giving you full session access.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(item => (
              <div key={item} className="card h-20 animate-pulse" />
            ))}
          </div>
        ) : history?.locked ? (
          <div className="card p-8 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <LockIcon size={28} />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-primary">History is locked for your current access</h2>
            <p className="mt-2 text-secondary">
              {history.message || 'Upgrade to unlock interview history.'}
            </p>
            {history.lock_reason === 'expired_plan' ? (
              <p className="mt-2 text-sm text-secondary">
                Renew or upgrade your plan to view premium interview history again.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {history.current_feedback_session_id ? (
                <Link href={`/report/${history.current_feedback_session_id}`} className="btn-secondary">
                  Open Current Session Feedback
                </Link>
              ) : null}
              <Link href="/pricing" className="btn-primary">Open Pricing</Link>
            </div>
          </div>
        ) : history?.sessions?.length ? (
          <div className="space-y-3 slide-up">
            <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-primary">Bulk session actions</div>
                <div className="mt-1 text-sm text-secondary">
                  {selectedSessionIds.length > 0
                    ? `${selectedSessionIds.length} session${selectedSessionIds.length === 1 ? '' : 's'} selected.`
                    : 'Select multiple sessions if you want to delete them together.'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-secondary">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
                  />
                  Select all on this page
                </label>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={!selectedSessionIds.length || Boolean(deletingId)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                >
                  <TrashIcon size={15} />
                  Delete selected
                </button>
              </div>
            </div>

            {history.sessions.map(session => {
              const scoreColor = session.score != null && session.score >= 70
                ? 'text-emerald-600'
                : session.score != null && session.score >= 50
                  ? 'text-amber-600'
                  : 'text-rose-500';

              return (
                <div key={session.id} className="card flex flex-col gap-4 p-5 transition-colors hover:border-blue-400 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <label className="mt-1 inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedSessionIds.includes(session.id)}
                        onChange={() => toggleSessionSelection(session.id)}
                        className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                    <Link href={`/report/${session.id}`} className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                      <FileIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-primary">{session.plan.toUpperCase()} interview</div>
                      <div className="mt-1 text-sm text-secondary">
                        {session.total_turns} questions | {session.duration ? `${Math.round(session.duration / 60)} min` : 'Duration not recorded'}
                      </div>
                      <div className="mt-1 text-xs text-tertiary">
                        Started {new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    </Link>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      {session.state === 'FINISHED' ? (
                        <div className={`text-2xl font-bold ${scoreColor}`}>{Math.round(session.score || 0)}%</div>
                      ) : (
                        <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {session.state}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSession(session.id)}
                      disabled={deletingId === session.id}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                    >
                      <TrashIcon size={15} />
                      {deletingId === session.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-secondary">No history yet. Start an interview and come back here anytime.</p>
            <div className="mt-5">
              <Link 
                href={startInterviewHref} 
                className="btn-primary"
                onClick={(e) => {
                  const currentUsage = user?.usage;
                  if (!hasRemainingUsage(currentUsage)) {
                    e.preventDefault();
                    const plan = (user?.active_plan || user?.plan || 'free').toLowerCase();
                    const upgradeTo = plan === 'career' ? 'Career' : plan === 'pro' ? 'Career' : 'Pro or Career';
                    alert(`Your quota is reached. If you want to use more, please buy ${upgradeTo} based on your current plan.`);
                    router.push('/pricing');
                  }
                }}
              >
                {startInterviewHref === '/pricing' ? 'Open Pricing' : 'Start Interview'}
              </Link>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteCandidate) || bulkDeleteOpen}
        title={deleteCandidate ? 'Delete interview history?' : 'Delete selected interview history?'}
        description={deleteCandidate ? (
          <>
            This will permanently remove your <strong className="font-semibold text-white">{deleteCandidate.plan.toUpperCase()}</strong> session
            {' '}from history. This action cannot be undone.
          </>
        ) : selectedSessionIds.length > 0 ? (
          <>
            This will permanently remove <strong className="font-semibold text-white">{selectedSessionIds.length}</strong>
            {' '}selected session{selectedSessionIds.length === 1 ? '' : 's'} from history. This action cannot be undone.
          </>
        ) : ''}
        confirmLabel="Delete permanently"
        confirmTone="danger"
        loading={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) {
            setDeleteCandidateId(null);
            setBulkDeleteOpen(false);
          }
        }}
        onConfirm={() => void confirmDeleteSession()}
      />
    </div>
  );
}
