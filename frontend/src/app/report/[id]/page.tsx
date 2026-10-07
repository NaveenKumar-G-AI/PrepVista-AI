'use client';
import { ScoreSummary, MeasurementCoverage } from '@/components/score-summary';
import type { ScoreMeasurement } from '@/lib/score-semantics';
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
import { provenanceLabel } from '@/lib/assistance-views';
import { api } from '@/lib/api';
import { IntelDashboard } from './_intel/dashboard';

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
  audit?: EvaluationAudit | null;
  assistance_provenance?: string | null;
}

interface EvaluationAudit {
  transcript_corrected: boolean;
  corrected_transcript?: string | null;
  audio_url?: string | null;
  stt_confidence_pct?: number | null;
  stt_provider?: string | null;
}

interface AuditMeta {
  has_audio: boolean;
  has_corrections: boolean;
  retention_days: number;
  audio_retention_until?: string | null;
  dispute_contact_email: string;
  dispute_note: string;
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
  session: ScoreMeasurement & {
    id: string;
    plan: string;
    final_score: number | null;
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
    rubric_scores: Record<string, number | null>;
  };
  terminal_answer_records?: Array<{ question_instance_id: string; turn: number; question_text: string; outcome: string; raw_answer: string; evaluation_state?: string }>;
  evaluations: Evaluation[];
  user_plan: string;
  has_premium_access: boolean;
  has_pdf?: boolean;
  has_free_guidance?: boolean;
  premium_lock_reason?: string | null;
  interpretation?: string;
  pro_summary?: ProSummary | null;
  career_summary?: CareerSummary | null;
  audit?: AuditMeta | null;
  expected_questions?: number;
  answered_questions?: number;
  duration_seconds?: number | null;
  average_answer_time_seconds?: number | null;
  summary?: InterviewSummary;
  assistance_summary?: {
    enabled: boolean;
    total_questions: number;
    independent: number;
    hint_assisted: number;
    answer_guided: number;
    independent_coverage_pct: number;
  } | null;
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
  const scoreColor = session.final_score === null ? '#64748b' : session.final_score >= 70 ? '#22c55e' : session.final_score >= 50 ? '#eab308' : '#ef4444';
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
      // Append the on-screen Interview Intelligence charts to the end of the
      // server PDF. If the dashboard isn't present or merging fails, fall back
      // to the plain server PDF so the download never breaks.
      let finalBlob = blob;
      try {
        const { appendIntelCharts } = await import('./_intel/pdf-append');
        finalBlob = await appendIntelCharts(blob);
      } catch {
        finalBlob = blob;
      }
      const url = URL.createObjectURL(finalBlob);
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
        {data.terminal_answer_records?.filter(record => record.outcome !== 'EVALUATED' || record.evaluation_state !== 'COMPLETE').map(record => (
          <div key={record.question_instance_id} className="mb-8 rounded-xl border border-border bg-surface-primary overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/50 bg-surface-secondary/50">
              <p className="text-xs font-bold uppercase tracking-wider text-secondary mb-3">Question {record.turn}</p>
              <p className="text-sm md:text-base leading-relaxed text-primary break-words whitespace-pre-wrap">{record.question_text}</p>
            </div>
            <div className="p-5 bg-surface-primary">
              <p className="text-xs font-bold uppercase tracking-wider text-secondary mb-3">Response</p>
              <p className="text-sm md:text-base text-secondary italic">
                {record.evaluation_state === 'PENDING' ? 'Evaluation pending. This answer has not been scored.'
                : record.evaluation_state === 'UNAVAILABLE' ? 'Evaluation unavailable. This answer has not been scored.'
                : record.outcome === 'TRANSCRIPTION_FAILED' ? 'Transcription could not be completed. This question was not scored.'
                : record.outcome === 'UNINTELLIGIBLE' ? 'No usable transcript was available. This question was not scored.'
                : record.outcome === 'ABORTED' ? 'The interview ended before this answer was completed. This question was not scored.'
                : record.outcome === 'SKIPPED' ? 'Question skipped.' : 'No answer provided.'}
              </p>
            </div>
          </div>
        ))}
        <div className="mb-10 fade-in flex flex-col items-center">
          <p className="text-sm font-semibold text-secondary mb-6 text-center">
            {session.plan.toUpperCase()} Interview - {new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          
          <div
            className="flex flex-col items-center justify-center rounded-full mb-8 shrink-0"
            style={{ 
              background: `${scoreColor}10`, 
              border: `4px solid ${scoreColor}`,
              width: 'clamp(140px, 40vw, 180px)',
              height: 'clamp(140px, 40vw, 180px)'
            }}
          >
            <span className={session.final_score === null ? "text-sm sm:text-base font-semibold text-center px-4" : "text-4xl sm:text-5xl font-bold"} style={{ color: scoreColor }}>
              <ScoreSummary value={session.final_score} measurement={session} suffix="" />
            </span>
            {session.final_score !== null && (
              <span className="text-sm font-medium mt-1" style={{ color: scoreColor }}>/ 100</span>
            )}
            <span className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: scoreColor }}>
              {session.final_score === null ? 'STATUS' : 'SCORE'}
            </span>
          </div>

          <div className="w-full max-w-3xl grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1">Assessed</span>
              <span className="text-base font-semibold text-primary">{session.measurement_coverage?.measured || 0} / {session.measurement_coverage?.asked || 0}</span>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1">Answered</span>
              <span className="text-base font-semibold text-primary">{answeredQuestions} / {expectedQuestions}</span>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1 whitespace-nowrap">No Answer / Skip</span>
              <span className="text-base font-semibold text-primary">{session.measurement_coverage?.intentional || 0}</span>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1">Total Time</span>
              <span className="text-base font-semibold text-primary">{durationLabel}</span>
            </div>
          </div>
          
          <div className="text-center mb-8">
            <MeasurementCoverage measurement={session} expectedQuestions={expectedQuestions} />
          </div>
          
          {averageAnswerTime ? (
            <p className="text-sm text-secondary mb-4">Average response time: {averageAnswerTime}s</p>
          ) : null}

          {data.interpretation ? (
            <p className="text-sm text-secondary max-w-xl mx-auto text-center">{data.interpretation}</p>
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

        {/* ── Assistance & Independence ─────────────────────────────── */}
        {data.assistance_summary && data.assistance_summary.enabled ? (
          <section className="card p-6 mb-6 slide-up">
            <h2 className="text-lg font-semibold text-primary mb-4">Assistance &amp; Independence</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.assistance_summary.independent}</div>
                <div className="text-xs text-secondary mt-1">Independent Attempt</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.assistance_summary.hint_assisted}</div>
                <div className="text-xs text-secondary mt-1">Hint-assisted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.assistance_summary.answer_guided}</div>
                <div className="text-xs text-secondary mt-1">Answer-guided</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{data.assistance_summary.independent_coverage_pct}%</div>
                <div className="text-xs text-secondary mt-1">Independent coverage</div>
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/15 px-4 py-3 text-xs text-blue-800 dark:text-blue-300">
              Assistance is recorded so PrepVista can distinguish what you demonstrated independently from what you completed with guidance. Supported answers remain useful learning evidence, but they require an independent retry before PrepVista treats them as independently demonstrated.
            </div>
          </section>
        ) : null}

        {session.rubric_scores && Object.keys(session.rubric_scores).length > 0 ? (
          <section className="card p-6 mb-6 slide-up">
            <h2 className="text-lg font-semibold text-primary mb-4">Category Breakdown</h2>
            {Object.entries(session.rubric_scores).map(([category, score]) => {
              const pct = score === null ? null : Math.min(100, Number(score) * 10);
              const barColor = pct === null ? '#64748b' : pct >= 70 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

              return (
                <div key={category} className="rubric-bar-container">
                  <span className="text-sm font-medium text-primary w-36">
                    {category.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())}
                  </span>
                  <div className="rubric-bar-bg">
                    <div className="rubric-bar-fill" style={{ width: `${pct ?? 0}%`, background: barColor }} />
                  </div>
                  <span className="text-sm font-semibold text-secondary w-12 text-right">{score === null ? "Not measured" : `${score}/10`}</span>
                </div>
              );
            })}
          </section>
        ) : null}

        {has_premium_access && session.final_score !== null && !data.terminal_answer_records?.some(record => ['TRANSCRIPTION_FAILED', 'UNINTELLIGIBLE', 'ABORTED'].includes(record.outcome)) ? (
          <section className="mb-6 slide-up">
            <h2 className="text-lg font-semibold text-primary mb-1">Interview Intelligence</h2>
            <p className="text-sm text-secondary mb-4">Premium analytics derived from this session&apos;s per-question evaluator data.</p>
            <IntelDashboard report={{ ...data, session: { ...session, final_score: session.final_score, rubric_scores: Object.fromEntries(Object.entries(session.rubric_scores).filter((entry): entry is [string, number] => entry[1] !== null)) } }} />
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
              <p className="text-sm text-secondary">Not enough measured evidence to identify strengths.</p>
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
              <p className="text-sm text-secondary">Not enough measured evidence to identify an improvement area.</p>
            )}
          </div>
        </div>

        <section className="slide-up">
          <h2 className="text-lg font-semibold text-primary mb-4">
            {isFreeSession ? 'Per-Question Coaching' : showProReview ? 'Pro Answer Review' : showCareerReview ? 'Career Answer Review' : 'Per-Question Breakdown'}
          </h2>
          {data.audit && (data.audit.has_audio || data.audit.has_corrections) ? (
            <div className="rounded-lg border border-border bg-surface-secondary p-4 mb-4 text-sm text-secondary">
              <p className="font-medium text-primary mb-1">Transcript &amp; audio audit trail</p>
              <p>{data.audit.dispute_note}</p>
              {data.audit.audio_retention_until ? (
                <p className="text-xs mt-2">
                  Saved audio is retained until {data.audit.audio_retention_until} ({data.audit.retention_days} days), then permanently deleted.
                </p>
              ) : null}
            </div>
          ) : null}
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

                  <div className="mb-2 text-xs text-secondary">{provenanceLabel(evaluation.assistance_provenance)}</div>

                  <p className="text-sm text-primary mb-2"><strong>Question:</strong> {evaluation.question_text}</p>
                  <p className="text-sm text-secondary mb-2"><strong>Your answer:</strong> {evaluation.normalized_answer || evaluation.raw_answer || 'No answer'}</p>
                  {evaluation.audit && (evaluation.audit.transcript_corrected || evaluation.audit.audio_url || evaluation.audit.stt_confidence_pct != null) ? (
                    <div className="rounded-lg border border-border bg-surface-secondary p-3 my-2">
                      <p className="text-xs uppercase tracking-wide text-secondary mb-2">Transcript &amp; audio record</p>
                      {evaluation.audit.transcript_corrected && evaluation.audit.corrected_transcript ? (
                        <p className="text-sm text-secondary mb-2">
                          <strong>Corrected transcript:</strong> {evaluation.audit.corrected_transcript}
                          <span className="block text-xs text-secondary mt-1">
                            Auto-corrected against your resume before scoring (e.g. mis-heard names or tools).
                          </span>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3">
                        {evaluation.audit.audio_url ? (
                          <audio controls preload="none" src={evaluation.audit.audio_url} className="h-8 max-w-full">
                            Your browser does not support audio playback.
                          </audio>
                        ) : null}
                        {evaluation.audit.stt_confidence_pct != null ? (
                          <span className="text-xs text-secondary">
                            Transcription confidence: {evaluation.audit.stt_confidence_pct}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
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
