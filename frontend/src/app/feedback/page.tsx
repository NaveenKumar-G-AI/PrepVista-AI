'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { FeedbackIcon } from '@/components/icons';
import { api, ApiFeedbackItem, ApiFeedbackResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function FeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const [feedbackText, setFeedbackText] = useState('');
  const [entries, setEntries] = useState<ApiFeedbackItem[]>([]);
  const [mode, setMode] = useState<'self' | 'admin'>('self');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.getFeedback<ApiFeedbackResponse>()
      .then(response => {
        setEntries(response.items || []);
        setMode(response.mode || 'self');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load feedback.'))
      .finally(() => setLoading(false));
  }, [authLoading, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const nextText = feedbackText.trim();
    if (!nextText) {
      setError('Please enter your feedback before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.submitFeedback(nextText);
      setEntries(previous => [response.item, ...previous]);
      setFeedbackText('');
      setSuccess('Your feedback was submitted successfully.');
      window.setTimeout(() => setSuccess(''), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader backHref="/dashboard" backLabel="Back to main" />

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <FeedbackIcon size={14} />
            Feedback section
          </div>
          <h1 className="text-3xl font-bold text-primary">Share your feedback</h1>
          <p className="mt-2 max-w-3xl text-secondary">
            Tell us what is working well, what feels slow, or what you want improved next. Your feedback is stored with your account email and name so it is easier to review.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="card p-6 slide-up">
            <h2 className="text-xl font-semibold text-primary">Send feedback</h2>
            <p className="mt-2 text-sm leading-7 text-secondary">
              Keep it practical. You can share bugs, UX issues, missing features, or anything that would improve your PrepVista experience.
            </p>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="feedback-text" className="mb-2 block text-sm font-medium text-primary">
                  Feedback
                </label>
                <textarea
                  id="feedback-text"
                  value={feedbackText}
                  onChange={event => setFeedbackText(event.target.value)}
                  rows={8}
                  maxLength={2000}
                  placeholder="Write your feedback here..."
                  className="w-full rounded-3xl border border-border bg-hover px-4 py-3 text-sm text-primary outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="mt-2 text-xs text-tertiary">{feedbackText.trim().length} / 2000</div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300">
                  {success}
                </div>
              ) : null}

              <button type="submit" disabled={submitting} className="btn-primary !px-6 !py-3 disabled:opacity-60">
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </form>
          </section>

          <section className="card p-6 slide-up">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-primary">
                  {mode === 'admin' ? 'All submitted feedback' : 'Your feedback history'}
                </h2>
                <p className="mt-1 text-sm text-secondary">
                  {mode === 'admin'
                    ? 'Admin view shows user name, email, and submitted feedback text.'
                    : 'You can review the feedback entries you already submitted from this account.'}
                </p>
              </div>
              <div className="rounded-full border border-border bg-hover px-3 py-1.5 text-xs font-medium text-secondary">
                {entries.length} item{entries.length === 1 ? '' : 's'}
              </div>
            </div>

            {loading ? (
              <div className="mt-5 space-y-3">
                {[1, 2, 3].map(item => (
                  <div key={item} className="h-24 animate-pulse rounded-3xl border border-border bg-hover" />
                ))}
              </div>
            ) : entries.length ? (
              <div className="mt-5 space-y-3">
                {entries.map(entry => (
                  <div key={entry.id} className="rounded-3xl border border-border bg-hover p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-primary">
                          {entry.full_name || 'PrepVista user'}
                        </div>
                        <div className="text-xs text-secondary">{entry.email}</div>
                      </div>
                      <div className="text-xs text-tertiary">
                        {new Date(entry.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-secondary">{entry.feedback_text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-border bg-hover p-5 text-sm text-secondary">
                No feedback submitted yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
