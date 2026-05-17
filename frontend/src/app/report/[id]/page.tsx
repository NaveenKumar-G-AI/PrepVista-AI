'use client';
/**
 * PrepVista - Report Page
 * Displays interview report with scores, rubric breakdown, per-question feedback.
 * Free users see limited view. Premium users can download a professional PDF.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { BrandLogo } from '@/components/brand-logo';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

interface Evaluation {
  turn_number: number;
  rubric_category: string;
  question_text: string;
  normalized_answer: string;
  raw_answer: string;
  classification: string;
  score: number;
  scoring_rationale: string;
  missing_elements: string[];
  ideal_answer: string;
  communication_score: number;
  communication_notes: string;
  relevance_score: number;
  clarity_score: number;
  specificity_score: number;
  structure_score: number;
  answer_status?: string | null;
  content_understanding?: string | null;
  depth_quality?: string | null;
  communication_clarity?: string | null;
  what_worked?: string | null;
  what_was_missing?: string | null;
  how_to_improve?: string | null;
  answer_blueprint?: string | null;
  corrected_intent?: string | null;
  answer_duration_seconds?: number | null;
}

interface CareerSummary {
  recruiter_impression?: string;
  technical_readiness?: string;
  role_fit?: string;
  main_blocker?: string;
  fastest_next_improvement?: string;
  round_1_likelihood?: string;
  interview_impression: string;
  shortlist_signal: string;
  top_hiring_risk: string;
  fastest_improvement: string;
  best_sample_answer_style: string;
  current_readiness: string;
  best_fit_role: string;
  main_hiring_blocker: string;
  next_practice_goals: string[];
}

interface ProSummary {
  technical_interview_impression: string;
  current_technical_readiness: string;
  main_blocker: string;
  fastest_next_improvement: string;
}

interface InterviewSummary {
  planned_questions?: number;
  closed_questions?: number;
  answered_questions?: number;
  clarification_count?: number;
  timeout_count?: number;
  skipped_count?: number;
  system_cutoff_count?: number;
  exited_early?: boolean;
  total_duration_seconds?: number | null;
  average_response_seconds?: number | null;
  per_question_response_times?: number[];
  completion_rate?: number;
  question_state?: string;
}

interface ReportData {
  session: {
    id: string;
    plan: string;
    final_score: number;
    total_turns: number;
    created_at: string;
    finished_at?: string | null;
    expected_questions?: number;
    answered_questions?: number;
    duration_seconds?: number | null;
    average_answer_time_seconds?: number | null;
    summary?: InterviewSummary;
    strengths: string[];
    weaknesses: string[];
    rubric_scores: Record<string, number>;
  };
  evaluations: Evaluation[];
  user_plan: string;
  has_premium_access: boolean;
  has_pdf?: boolean;
  has_free_guidance?: boolean;
  premium_lock_reason?: string | null;
  interpretation?: string;
  pro_summary?: ProSummary | null;
  career_summary?: CareerSummary | null;
  expected_questions?: number;
  answered_questions?: number;
  duration_seconds?: number | null;
  average_answer_time_seconds?: number | null;
  summary?: InterviewSummary;
}

function formatDurationLabel(totalSeconds?: number | null) {
  if (!totalSeconds || totalSeconds <= 0) {
    return 'Not recorded';
  }

  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getFreeBadgeClass(answerStatus?: string | null) {
  const normalized = (answerStatus || '').trim().toLowerCase();
  if (normalized === 'answered clearly') return 'cls-badge strong';
  if (normalized === 'answered partly') return 'cls-badge partial';
  if (normalized === 'answered briefly') return 'cls-badge vague';
  return 'cls-badge silent';
}

function getStatusBadgeClass(answerStatus?: string | null, fallbackClassification?: string | null) {
  const normalized = (answerStatus || '').trim().toLowerCase();
  if (normalized === 'strong' || normalized === 'answered clearly') return 'cls-badge strong';
  if (normalized === 'correct but shallow' || normalized === 'answered partly' || normalized === 'partial answer' || normalized === 'relevant but shallow') return 'cls-badge partial';
  if (normalized === 'relevant but too short' || normalized === 'relevant but unclear' || normalized === 'answered briefly') return 'cls-badge vague';
  if (normalized === 'clarification requested' || normalized === 'no answer' || normalized === 'timed out' || normalized === 'system cut off' || normalized === 'user stopped early') return 'cls-badge silent';

  const classification = (fallbackClassification || '').trim().toLowerCase();
  if (classification === 'strong') return 'cls-badge strong';
  if (classification === 'partial') return 'cls-badge partial';
  if (classification === 'vague') return 'cls-badge vague';
  return 'cls-badge silent';
}

export default function ReportPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState('');

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/history');
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    api.getReport<ReportData>(sessionId)
      .then(report => setData(report))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [authLoading, router, sessionId, user]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="card p-8 text-center max-w-md">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Link href="/dashboard" className="btn-primary inline-block">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { session, evaluations, has_premium_access } = data;
  const isFreeSession = session.plan === 'free';
  const isProSession = session.plan === 'pro';
  const isCareerSession = session.plan === 'career';
  const showProReview = isProSession && has_premium_access;
  const showCareerReview = isCareerSession && has_premium_access;
  const scoreColor = session.final_score >= 70 ? '#22c55e' : session.final_score >= 50 ? '#eab308' : '#ef4444';
  const summary = session.summary ?? data.summary;
  const expectedQuestions = summary?.planned_questions ?? session.expected_questions ?? data.expected_questions ?? evaluations.length;
  const answeredQuestions = summary?.answered_questions ?? session.answered_questions ?? data.answered_questions ?? evaluations.filter(item => item.classification !== 'silent').length;
  const durationLabel = formatDurationLabel(summary?.total_duration_seconds ?? session.duration_seconds ?? data.duration_seconds ?? null);
  const averageAnswerTime = summary?.average_response_seconds ?? session.average_answer_time_seconds ?? data.average_answer_time_seconds ?? null;

  const handleDownloadPDF = async () => {
    if (downloading) {
      return;
    }

    setDownloading(true);
    setDownloadError('');
    setDownloadSuccess('');

    try {
      const blob = await api.downloadPDF(sessionId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `prepvista-report-${sessionId.slice(0, 8)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setDownloadSuccess('Your PDF download has started. If it does not appear, try again in a moment.');
      window.setTimeout(() => setDownloadSuccess(''), 3200);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadErr) {
      const message = downloadErr instanceof Error ? downloadErr.message : 'PDF download failed. Please try again.';
      setDownloadError(
        /signal is aborted|aborted without reason|aborterror/i.test(message)
          ? 'PDF generation is taking longer than expected. Please try again in a moment.'
          : message,
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen surface-primary">
      <nav className="border-b border-border px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex">
            <BrandLogo size={32} priority nameClassName="text-lg font-bold text-primary" />
          </Link>
          <button type="button" onClick={handleBack} className="text-sm text-secondary hover:text-brand">
            Back
          </button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-10 fade-in">
          <p className="text-sm text-secondary mb-2">
            {session.plan.toUpperCase()} Interview - {new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div
            className="inline-flex items-center justify-center w-28 h-28 rounded-full mb-4"
            style={{ background: `${scoreColor}15`, border: `3px solid ${scoreColor}` }}
          >
            <span className="text-4xl font-bold" style={{ color: scoreColor }}>
              {Math.round(session.final_score)}
            </span>
          </div>
          <p className="text-sm text-secondary">
            out of 100 - {answeredQuestions} answered out of {expectedQuestions} planned questions
          </p>
          <p className="mt-2 text-sm text-secondary">
            Total time: {durationLabel}{averageAnswerTime ? ` | Avg response: ${averageAnswerTime}s` : ''}
          </p>
          {data.interpretation ? (
            <p className="mt-3 text-sm text-secondary max-w-xl mx-auto">{data.interpretation}</p>
          ) : null}

          {has_premium_access && data.has_pdf ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={downloading}
                className="btn-secondary text-sm !py-2 !px-5 disabled:opacity-60"
              >
                {downloading ? 'Preparing PDF...' : 'Download PDF'}
              </button>
              {downloading ? (
                <p className="mt-3 text-sm text-secondary">Keep this tab open while your professional PDF is being prepared.</p>
              ) : null}
              {downloadSuccess ? (
                <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{downloadSuccess}</p>
              ) : null}
              {downloadError ? (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{downloadError}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {session.rubric_scores && Object.keys(session.rubric_scores).length > 0 ? (
          <section className="card p-6 mb-6 slide-up">
            <h2 className="text-lg font-semibold text-primary mb-4">Category Breakdown</h2>
            {Object.entries(session.rubric_scores).map(([category, score]) => {
              const pct = Math.min(100, Number(score) * 10);
              const barColor = pct >= 70 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

              return (
                <div key={category} className="rubric-bar-container">
                  <span className="text-sm font-medium text-primary w-36">
                    {category.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
                  </span>
                  <div className="rubric-bar-bg">
                    <div className="rubric-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <span className="text-sm font-semibold text-secondary w-12 text-right">{score}/10</span>
                </div>
              );
            })}
          </section>
        ) : null}

        <div className="grid md:grid-cols-2 gap-4 mb-6 slide-up">
          <div className="card p-5">
            <h3 className="font-semibold text-primary mb-3">Strengths</h3>
            {session.strengths?.length ? (
              <ul className="space-y-2">
                {session.strengths.map((strength, index) => (
                  <li key={index} className="text-sm text-secondary flex items-start gap-2">
                    <span className="text-green-500 flex-shrink-0">+</span>
                    {strength}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-secondary">Complete more interviews to see strengths.</p>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-primary mb-3">Areas to Improve</h3>
            {session.weaknesses?.length ? (
              <ul className="space-y-2">
                {session.weaknesses.map((weakness, index) => (
                  <li key={index} className="text-sm text-secondary flex items-start gap-2">
                    <span className="text-amber-500 flex-shrink-0">!</span>
                    {weakness}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-secondary">Great job! Keep practicing.</p>
            )}
          </div>
        </div>

        <section className="slide-up">
          <h2 className="text-lg font-semibold text-primary mb-4">
            {isFreeSession ? 'Per-Question Coaching' : showProReview ? 'Pro Answer Review' : showCareerReview ? 'Career Answer Review' : 'Per-Question Breakdown'}
          </h2>
          <div className="space-y-4">
            {evaluations.map((evaluation, index) => {
              const clsColors: Record<string, string> = {
                strong: 'cls-badge strong',
                partial: 'cls-badge partial',
                vague: 'cls-badge vague',
                wrong: 'cls-badge wrong',
                silent: 'cls-badge silent',
              };
              const badgeLabel = isFreeSession || showProReview || showCareerReview
                ? (evaluation.answer_status || evaluation.classification?.toUpperCase() || 'NO ANSWER')
                : (evaluation.classification?.toUpperCase() || 'SILENT');
              const badgeClass = isFreeSession
                ? getFreeBadgeClass(evaluation.answer_status)
                : getStatusBadgeClass(evaluation.answer_status, evaluation.classification) || (clsColors[evaluation.classification] || 'cls-badge silent');

              return (
                <div key={index} className="card p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-bold text-brand">Q{index + 1}</span>
                    <span className="text-xs text-secondary">
                      {(evaluation.rubric_category || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
                    </span>
                    <span className={badgeClass}>
                      {badgeLabel}
                    </span>
                    <span className="text-sm font-semibold ml-auto">{evaluation.score}/10</span>
                  </div>

                  <p className="text-sm text-primary mb-2"><strong>Question:</strong> {evaluation.question_text}</p>
                  <p className="text-sm text-secondary mb-2"><strong>Your answer:</strong> {evaluation.normalized_answer || evaluation.raw_answer || 'No answer'}</p>
                  {evaluation.answer_duration_seconds ? (
                    <p className="text-xs text-secondary mb-2">Response time: {evaluation.answer_duration_seconds}s</p>
                  ) : null}
                  {isFreeSession ? (
                    <>
                      <div className="grid sm:grid-cols-3 gap-3 my-3">
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Answer Label</p>
                          <p className="text-sm font-medium text-primary">{evaluation.answer_status || 'Not available'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Idea Quality</p>
                          <p className="text-sm font-medium text-primary">{evaluation.content_understanding || 'Basic'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Speaking Clarity</p>
                          <p className="text-sm font-medium text-primary">{evaluation.communication_clarity || 'Basic'}</p>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-2">Score Parts</p>
                          <div className="space-y-1 text-sm text-secondary">
                            <p>Question match: {evaluation.relevance_score || 0} / 2</p>
                            <p>Basic accuracy: {evaluation.clarity_score || 0} / 2</p>
                            <p>Specificity: {evaluation.specificity_score || 0} / 2</p>
                            <p>Structure: {evaluation.structure_score || 0} / 2</p>
                            <p>Communication: {((evaluation.communication_score || 0) / 5).toFixed(1)} / 2</p>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-2">Score Summary</p>
                          <p className="text-sm text-secondary">{evaluation.scoring_rationale || 'A detailed reason was not available.'}</p>
                        </div>
                      </div>

                      {evaluation.what_worked ? (
                        <p className="text-sm text-secondary mb-2"><strong>What worked:</strong> {evaluation.what_worked}</p>
                      ) : null}
                      {evaluation.what_was_missing ? (
                        <p className="text-sm text-secondary mb-2"><strong>Why the score is not higher:</strong> {evaluation.what_was_missing}</p>
                      ) : null}
                      {evaluation.how_to_improve ? (
                        <p className="text-sm text-secondary mb-2"><strong>Next time do this:</strong> {evaluation.how_to_improve}</p>
                      ) : null}
                      {evaluation.ideal_answer ? (
                        <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border-l-3 border-blue-500">
                          <p className="text-sm">
                            <strong className="text-brand">Better Answer:</strong>{' '}
                            <span className="text-secondary">{evaluation.ideal_answer}</span>
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : showProReview ? (
                    <>
                      <div className="grid sm:grid-cols-3 gap-3 my-3">
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Answer Label</p>
                          <p className="text-sm font-medium text-primary">{evaluation.answer_status || 'Not available'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Technical Understanding</p>
                          <p className="text-sm font-medium text-primary">{evaluation.content_understanding || 'Basic'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Answer Delivery</p>
                          <p className="text-sm font-medium text-primary">{evaluation.communication_clarity || 'Basic'}</p>
                        </div>
                      </div>

                      {evaluation.corrected_intent ? (
                        <p className="text-sm text-secondary mb-2"><strong>Corrected intent:</strong> {evaluation.corrected_intent}</p>
                      ) : null}

                      <div className="grid sm:grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-2">Score Parts</p>
                          <div className="space-y-1 text-sm text-secondary">
                            <p>Question match: {evaluation.relevance_score || 0} / 2</p>
                            <p>Technical accuracy: {evaluation.clarity_score || 0} / 2</p>
                            <p>Specificity: {evaluation.specificity_score || 0} / 2</p>
                            <p>Structure: {evaluation.structure_score || 0} / 2</p>
                            <p>Communication: {((evaluation.communication_score || 0) / 5).toFixed(1)} / 2</p>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-2">Score Summary</p>
                          <p className="text-sm text-secondary">{evaluation.scoring_rationale || 'A detailed reason was not available.'}</p>
                        </div>
                      </div>

                      {evaluation.what_worked ? (
                        <p className="text-sm text-secondary mb-2"><strong>What you got right:</strong> {evaluation.what_worked}</p>
                      ) : null}
                      {evaluation.what_was_missing ? (
                        <p className="text-sm text-secondary mb-2"><strong>Main technical gap:</strong> {evaluation.what_was_missing}</p>
                      ) : null}
                      {evaluation.how_to_improve ? (
                        <p className="text-sm text-secondary mb-2"><strong>How to answer this better:</strong> {evaluation.how_to_improve}</p>
                      ) : null}
                      {evaluation.ideal_answer ? (
                        <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border-l-3 border-blue-500">
                          <p className="text-sm">
                            <strong className="text-brand">Better Answer:</strong>{' '}
                            <span className="text-secondary">{evaluation.ideal_answer}</span>
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : showCareerReview ? (
                    <>
                      <div className="grid sm:grid-cols-4 gap-3 my-3">
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Answer Label</p>
                          <p className="text-sm font-medium text-primary">{evaluation.answer_status || 'Not available'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Content Quality</p>
                          <p className="text-sm font-medium text-primary">{evaluation.content_understanding || 'Basic'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Depth Quality</p>
                          <p className="text-sm font-medium text-primary">{evaluation.depth_quality || 'Basic'}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-1">Answer Delivery</p>
                          <p className="text-sm font-medium text-primary">{evaluation.communication_clarity || 'Basic'}</p>
                        </div>
                      </div>

                      {evaluation.corrected_intent ? (
                        <p className="text-sm text-secondary mb-2"><strong>Corrected intent:</strong> {evaluation.corrected_intent}</p>
                      ) : null}

                      <div className="grid sm:grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-2">Score Parts</p>
                          <div className="space-y-1 text-sm text-secondary">
                            <p>Relevance: {evaluation.relevance_score || 0} / 2</p>
                            <p>Depth: {evaluation.clarity_score || 0} / 2</p>
                            <p>Specificity: {evaluation.specificity_score || 0} / 2</p>
                            <p>Structure: {evaluation.structure_score || 0} / 2</p>
                            <p>Communication: {((evaluation.communication_score || 0) / 5).toFixed(1)} / 2</p>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-secondary p-3">
                          <p className="text-xs uppercase tracking-wide text-secondary mb-2">Score Summary</p>
                          <p className="text-sm text-secondary">{evaluation.scoring_rationale || 'A detailed reason was not available.'}</p>
                        </div>
                      </div>

                      {evaluation.what_worked ? (
                        <p className="text-sm text-secondary mb-2"><strong>What you did well:</strong> {evaluation.what_worked}</p>
                      ) : null}
                      {evaluation.what_was_missing ? (
                        <p className="text-sm text-secondary mb-2"><strong>Main gap:</strong> {evaluation.what_was_missing}</p>
                      ) : null}
                      {evaluation.communication_notes ? (
                        <p className="text-sm text-secondary mb-2"><strong>Why this matters in a real interview:</strong> {evaluation.communication_notes}</p>
                      ) : null}
                      {evaluation.answer_blueprint ? (
                        <p className="text-sm text-secondary mb-2"><strong>Best answer structure:</strong> {evaluation.answer_blueprint}</p>
                      ) : null}
                      {evaluation.ideal_answer ? (
                        <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border-l-3 border-blue-500">
                          <p className="text-sm">
                            <strong className="text-brand">Better Answer:</strong>{' '}
                            <span className="text-secondary">{evaluation.ideal_answer}</span>
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {evaluation.scoring_rationale ? (
                        <p className="text-sm text-secondary mb-2"><strong>Assessment:</strong> {evaluation.scoring_rationale}</p>
                      ) : null}
                      {evaluation.missing_elements?.length > 0 ? (
                        <p className="text-sm text-secondary mb-2"><strong>Missing:</strong> {evaluation.missing_elements.join(', ')}</p>
                      ) : null}

                      {evaluation.ideal_answer ? (
                        has_premium_access ? (
                          <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border-l-3 border-blue-500">
                            <p className="text-sm">
                              <strong className="text-brand">Ideal Answer:</strong>{' '}
                              <span className="text-secondary">{evaluation.ideal_answer}</span>
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 relative">
                            <div className="locked-content p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border-l-3 border-blue-500">
                              <p className="text-sm">Ideal Answer: Upgrade to unlock the polished answer guidance for this question.</p>
                            </div>
                            <div className="locked-overlay">
                              <Link href="/pricing" className="btn-primary text-sm !py-2 !px-4">Unlock Ideal Answers</Link>
                            </div>
                          </div>
                        )
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {showProReview && data.pro_summary ? (
          <section className="card p-6 mt-8 slide-up">
            <h2 className="text-lg font-semibold text-primary mb-4">Technical Readiness</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-border bg-surface-secondary p-4">
                <p className="text-xs uppercase tracking-wide text-secondary mb-1">Current Technical Readiness</p>
                <p className="text-sm font-medium text-primary">{data.pro_summary.current_technical_readiness}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-secondary p-4">
                <p className="text-xs uppercase tracking-wide text-secondary mb-1">Fastest Next Improvement</p>
                <p className="text-sm text-secondary">{data.pro_summary.fastest_next_improvement}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-secondary">
              <p><strong className="text-primary">Technical interview impression:</strong> {data.pro_summary.technical_interview_impression}</p>
              <p><strong className="text-primary">Main blocker:</strong> {data.pro_summary.main_blocker}</p>
            </div>
          </section>
        ) : null}

        {showCareerReview && data.career_summary ? (
          <section className="card p-6 mt-8 slide-up">
            <h2 className="text-lg font-semibold text-primary mb-4">Hiring-Panel Readiness</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-border bg-surface-secondary p-4">
                <p className="text-xs uppercase tracking-wide text-secondary mb-1">Technical Readiness</p>
                <p className="text-sm font-medium text-primary">{data.career_summary.technical_readiness || data.career_summary.current_readiness}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-secondary p-4">
                <p className="text-xs uppercase tracking-wide text-secondary mb-1">Role Fit</p>
                <p className="text-sm font-medium text-primary">{data.career_summary.role_fit || data.career_summary.best_fit_role}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-secondary p-4">
                <p className="text-xs uppercase tracking-wide text-secondary mb-1">Round 1 Likelihood</p>
                <p className="text-sm text-secondary">{data.career_summary.round_1_likelihood || data.career_summary.shortlist_signal}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-secondary p-4">
                <p className="text-xs uppercase tracking-wide text-secondary mb-1">Main Blocker</p>
                <p className="text-sm text-secondary">{data.career_summary.main_blocker || data.career_summary.main_hiring_blocker}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-secondary">
              <p><strong className="text-primary">Recruiter impression:</strong> {data.career_summary.recruiter_impression || data.career_summary.interview_impression}</p>
              <p><strong className="text-primary">Fastest next improvement:</strong> {data.career_summary.fastest_next_improvement || data.career_summary.fastest_improvement}</p>
              <p><strong className="text-primary">Best sample answer style:</strong> {data.career_summary.best_sample_answer_style}</p>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-primary mb-2">Top 3 Next Practice Goals</h3>
              <ul className="list-disc space-y-2 pl-5 marker:text-blue-500">
                {data.career_summary.next_practice_goals.map((goal, index) => (
                  <li key={index} className="text-sm text-secondary">
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {!has_premium_access ? (
          <div className="card p-8 text-center mt-8 border-blue-200 dark:border-blue-800 slide-up">
            <h3 className="text-lg font-semibold text-primary mb-2">
              {isFreeSession ? 'Upgrade for deeper report tools' : 'See exactly how to answer each question'}
            </h3>
            <p className="text-secondary text-sm mb-4">
              {isFreeSession
                ? 'Your free report now includes beginner coaching. Upgrade to unlock PDF downloads, deeper premium insights, and advanced report features.'
                : data.premium_lock_reason || 'Upgrade to unlock ideal answers, PDF reports, and deeper coaching insights.'}
            </p>
            <Link href="/pricing" className="btn-primary inline-block">Upgrade Now</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
