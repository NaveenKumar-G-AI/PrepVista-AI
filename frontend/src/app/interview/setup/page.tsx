'use client';
/**
 * PrepVista - Interview Setup Page
 * Upload resume and start interview. Selected-plan quota is enforced here too.
 */

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { AuthHeader } from '@/components/auth-header';
import { DifficultySelector } from '@/components/difficulty-selector';
import { PlanSelector } from '@/components/plan-selector';
import { AlertIcon, BoltIcon, CrownIcon, FileIcon, InfoIcon, LockIcon, MicIcon, ShieldIcon, TargetIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getLowLimitNotice, getStartInterviewHref, getUsageHeadline, hasRemainingUsage, isUnlimitedUsage } from '@/lib/plan-usage';

export default function InterviewSetupPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [difficultyMode, setDifficultyMode] = useState('auto');

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const usage = user?.usage;
  const hasRemaining = hasRemainingUsage(usage);
  const startHref = getStartInterviewHref(usage);
  const lowLimitNotice = getLowLimitNotice(usage);
  const unlimited = isUnlimitedUsage(usage);
  const activePlan = user?.active_plan || user?.plan || 'free';

  const handleFile = (nextFile: File | null) => {
    if (!nextFile) {
      return;
    }
    if (nextFile.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum 5MB.');
      return;
    }
    setError('');
    setFile(nextFile);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!hasRemaining) {
      router.push('/pricing');
      return;
    }
    if (!file || loading) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('plan', activePlan);
      formData.append('difficulty_mode', difficultyMode);

      const result = await api.setupInterview<{
        session_id: string;
        access_token: string;
        duration_seconds: number;
        max_turns: number;
        plan: string;
        difficulty_mode: string;
        candidate_name: string;
        proctoring_mode: string;
      }>(formData);

      sessionStorage.setItem('pv_interview_session', JSON.stringify({
        session_id: result.session_id,
        access_token: result.access_token,
        duration_seconds: result.duration_seconds,
        max_turns: result.max_turns,
        plan: result.plan,
        difficulty_mode: result.difficulty_mode,
        candidate_name: result.candidate_name,
        proctoring_mode: result.proctoring_mode,
      }));

      router.push(`/interview/${result.session_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start interview. Please try again.';
      if (message.includes('quota_exceeded')) {
        router.push('/pricing');
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
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

      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 text-center fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <BoltIcon size={14} />
            Interview setup
          </div>
          <h1 className="text-3xl font-bold text-primary">Start an Interview</h1>
          <p className="mt-2 text-secondary">
            Upload your resume and launch an interview session tailored to your selected plan.
          </p>
        </div>

        <div className={`quota-banner mb-6 ${unlimited ? 'quota-banner-unlimited' : hasRemaining ? 'quota-banner-active' : 'quota-banner-blocked'}`}>
          <div className="flex items-start gap-3">
            <div className="quota-icon">
              {unlimited ? <CrownIcon size={18} /> : hasRemaining ? <BoltIcon size={18} /> : <LockIcon size={18} />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-primary">{getUsageHeadline(usage)}</div>
              <div className="mt-1 text-sm text-secondary">
                {unlimited
                  ? 'Career is now unlimited, so low-limit warnings are intentionally hidden here.'
                  : lowLimitNotice || 'You can continue with the currently selected plan.'}
              </div>
            </div>
            <div className="plan-warning-pill">
              {unlimited ? 'Unlimited' : `${usage?.remaining ?? 0} left`}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 slide-up">
          <div
            className={`card cursor-pointer p-8 text-center transition-all interactive-card ${
              !hasRemaining
                ? 'opacity-70'
                : dragActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                  : file
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
                    : 'hover:border-blue-400'
            }`}
            onClick={() => hasRemaining && fileRef.current?.click()}
            onDragOver={event => {
              event.preventDefault();
              if (hasRemaining) {
                setDragActive(true);
              }
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={event => {
              event.preventDefault();
              setDragActive(false);
              if (hasRemaining) {
                handleFile(event.dataTransfer.files[0]);
              }
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={event => handleFile(event.target.files?.[0] || null)}
            />

            <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <FileIcon size={24} />
            </div>

            {file ? (
              <>
                <p className="font-medium text-primary">{file.name}</p>
                <p className="mt-1 text-xs text-secondary">{(file.size / 1024).toFixed(0)} KB</p>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    setFile(null);
                  }}
                  className="mt-3 text-xs font-medium text-red-500 hover:underline"
                >
                  Remove file
                </button>
              </>
            ) : (
              <>
                <p className="font-medium text-primary">
                  {hasRemaining ? 'Drop your resume here or click to browse' : 'Resume upload is paused until access is restored'}
                </p>
                <p className="mt-1 text-xs text-secondary">PDF only | Max 5MB</p>
              </>
            )}
          </div>

          <div className="card relative overflow-visible p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  <CrownIcon size={18} />
                </div>
                <div>
                  <div className="text-sm text-secondary">Interview plan selection</div>
                  <div className="font-semibold text-primary">{activePlan.toUpperCase()} is selected for this interview</div>
                  <div className="mt-1 text-xs text-secondary">
                    Locked plans open billing automatically so you can upgrade or restore access.
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <PlanSelector user={user} placement="top" />
                <Link href="/pricing" className="text-sm font-medium text-brand hover:underline">
                  Open billing and plan access
                </Link>
              </div>
            </div>
          </div>

          <div className="card relative overflow-visible p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  <TargetIcon size={18} />
                </div>
                <div>
                  <div className="text-sm text-secondary">Interview difficulty</div>
                  <div className="font-semibold text-primary">{difficultyMode === 'auto' ? 'Auto difficulty is selected' : `${difficultyMode.charAt(0).toUpperCase()}${difficultyMode.slice(1)} difficulty is selected`}</div>
                  <div className="mt-1 text-xs text-secondary">
                    Choose <strong className="text-primary">Difficult</strong> if you want stronger practice and fewer tiny warm-up questions. <strong className="text-primary">Auto</strong> keeps the current smart behavior.
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <DifficultySelector value={difficultyMode} onChange={setDifficultyMode} placement="top" />
                <span className="text-xs text-secondary">
                  Basic = calmer, Medium = balanced, Difficult = sharper.
                </span>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          ) : null}

          <div className="dark-notice-panel px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="dark-notice-icon mt-0.5">
                <InfoIcon size={18} />
              </div>
              <div>
                <div className="dark-notice-title text-sm font-semibold">Before you press Start Interview</div>
                <p className="dark-notice-body mt-1 text-sm">
                  Read <strong className="text-white">About Interview</strong> once before starting. It covers microphone setup, session flow, and core interview rules.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-lg">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Starting interview...
                </span>
              ) : hasRemaining ? (
                'Start Interview'
              ) : (
                'Open Pricing to Continue'
              )}
            </button>

            <button
              type="button"
              className="btn-secondary w-full !py-3.5 text-base"
              onClick={() => setAboutOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <InfoIcon size={18} />
                About Interview
              </span>
            </button>
          </div>

          {!hasRemaining ? (
            <div className="text-center text-sm text-secondary">
              This selected plan has no remaining interviews. Pressing start will open pricing so you can restore access or switch to another owned tier.
            </div>
          ) : null}

          <p className="text-center text-xs text-tertiary">
            Resume text is processed only to personalize interview questions. It is not shared and can be managed from your settings.
          </p>

          <div className="text-center">
            <Link href={startHref} className="text-sm font-medium text-brand hover:underline">
              Need a different plan first? Open pricing
            </Link>
          </div>
        </form>
      </div>

      {aboutOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-md"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6 sm:p-8"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  <ShieldIcon size={14} />
                  Interview rules
                </div>
                <h2 className="text-2xl font-bold text-primary">About this interview</h2>
                <p className="mt-2 max-w-2xl text-sm text-secondary">
                  Please read these rules before you upload your resume and begin. The interview is monitored for fairness and will react automatically if the environment becomes unsafe.
                </p>
              </div>

              <button type="button" className="btn-secondary" onClick={() => setAboutOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="card p-5">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  <MicIcon size={18} />
                </div>
                <h3 className="text-base font-semibold text-primary">Required access</h3>
                <p className="mt-2 text-sm text-secondary">
                  Microphone is required.
                </p>
              </div>

            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="card p-5">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <ShieldIcon size={14} />
                  Proctoring checks
                </div>
                <div className="space-y-3 text-sm text-secondary">
                  <div className="flex items-start gap-3">
                    <MicIcon size={18} className="mt-0.5 text-blue-600 dark:text-blue-300" />
                    <span>Head turns, focus loss, and tab switching are highly discouraged.</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <LockIcon size={18} className="mt-0.5 text-blue-600 dark:text-blue-300" />
                    <span>We recommend keeping the tab focused and minimizing distractions.</span>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <BoltIcon size={14} />
                  Interview flow
                </div>
                <div className="space-y-3 text-sm text-secondary">
                  <div className="flex items-start gap-3">
                    <FileIcon size={18} className="mt-0.5 text-blue-600 dark:text-blue-300" />
                    <span>Your resume PDF is used to personalize questions before the session starts.</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <MicIcon size={18} className="mt-0.5 text-blue-600 dark:text-blue-300" />
                    <span>Speech is transcribed live. If 20 seconds of silence pass, the current answer is auto-submitted.</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <InfoIcon size={18} className="mt-0.5 text-blue-600 dark:text-blue-300" />
                    <span>You can still end the interview manually, and you will be evaluated based on completed progress.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              <div className="flex items-start gap-3">
                <LockIcon size={18} className="mt-0.5" />
                <span>
                  Best practice: keep the tab focused and avoid extra people or devices during the session.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
