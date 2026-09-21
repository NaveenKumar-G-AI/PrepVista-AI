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
import { BoltIcon, CrownIcon, FileIcon, InfoIcon, LockIcon, MicIcon, ShieldIcon, TargetIcon } from '@/components/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useArtifact } from '@/modules/coding/artifact-view';
import { MissionContext } from '@/modules/coding/mission-context';
import { getLowLimitNotice, getStartInterviewHref, getUsageHeadline, hasRemainingUsage, isUnlimitedUsage } from '@/lib/plan-usage';

export default function InterviewSetupPage() {
  const { user } = useAuth();
  return <InterviewSetupForm key={user?.id || 'guest'} />;
}
function InterviewSetupForm() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [difficultyMode, setDifficultyMode] = useState('auto');
  const [interviewMode, setInterviewMode] = useState('standard');
  const [targetRole, setTargetRole] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(18);
  const [categories, setCategories] = useState<string[]>([]);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const artifact = useArtifact(artifactId);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('artifact_id');
    if (id) { setArtifactId(id); setInterviewMode('project_defense'); }
  }, []);

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
    if (!/\.(pdf|docx?|png|jpe?g|webp|bmp|tiff?)$/i.test(nextFile.name)) {
      setFile(null);
      setError('Please upload a PDF, Word document, or resume image.');
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setFile(null);
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
    if (loading) {
      return;
    }
    if (!file) {
      setError('Choose your resume before starting the interview.');
      return;
    }
    if (artifactId && !artifact?.data) {
      setError('Load or remove the selected coding artifact before starting.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('expected_owner_id', user?.id || '');
      formData.append('plan', activePlan);
      formData.append('difficulty_mode', difficultyMode);
      formData.append('interview_mode', interviewMode);
      formData.append('target_role', targetRole);
      formData.append('target_company', targetCompany);
      formData.append('department', department);
      formData.append('job_description', jobDescription);
      formData.append('duration', String(durationMinutes * 60));
      formData.append('categories', categories.join(','));
      if (artifactId && artifact?.data) formData.append('coding_artifact_id', artifactId);
      const missionId = new URLSearchParams(window.location.search).get('mission_id');
      if (missionId) formData.append('mission_id', missionId);

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

      if (!active.current) return;
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
      if (!active.current) return;
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
      <div className="mx-auto max-w-6xl px-6 pt-6"><MissionContext/></div>

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
          {artifactId && <section className="card p-5 space-y-3"><h2 className="text-lg font-semibold">Coding artifact for this interview</h2><p role="status">{artifact?.error || (artifact?.data ? `${artifact.data.content.challenge_id} · ${artifact.data.content.language}` : 'Loading saved artifact...')}</p>{artifact?.data && <><p>The interviewer will use up to 6,000 characters of this saved code and 2,000 characters of your explanation. Browser checks remain practice observations.</p><details><summary>Preview saved code</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{artifact.data.content.code.slice(0, 6000)}</pre></details></>}<button type="button" className="underline" onClick={() => setArtifactId(null)}>Remove artifact from this interview</button></section>}
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
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif"
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
                <p className="mt-1 text-xs text-secondary">PDF, Word, or image | Max 5MB</p>
                <button type="button" className="btn-secondary mt-3" disabled={!hasRemaining || loading} onClick={event => { event.stopPropagation(); fileRef.current?.click(); }}>Choose resume</button>
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

          <section className="card p-4 sm:p-5 space-y-4" aria-labelledby="interview-focus-title">
            <h2 id="interview-focus-title" className="font-semibold text-lg">Shape your interview</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm space-y-2">Interview mode
                <select className="input w-full min-h-11" value={interviewMode} onChange={event => {
                  const mode = event.target.value;
                  setInterviewMode(mode);
                  setDurationMinutes(mode === 'quick' ? 9 : ['full', 'campus'].includes(mode) ? 30 : mode === 'project_defense' ? 20 : 18);
                }}>
                  {Object.entries({ quick: 'Quick', standard: 'Standard', full: 'Full placement', hr: 'HR', technical_hr: 'Technical + HR', project_defense: 'Project defense', behavioral: 'Behavioral', company_role: 'Company / role', pressure: 'Pressure', campus: 'Campus simulation', custom: 'Custom' }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-2">Duration in minutes
                <input className="input w-full min-h-11" type="number" min={3} max={interviewMode === 'quick' ? 10 : ['full', 'campus'].includes(interviewMode) ? 35 : 30} value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))} />
              </label>
              <label className="text-sm space-y-2">Target role
                <input className="input w-full min-h-11" maxLength={120} placeholder="e.g. Backend Engineer" value={targetRole} onChange={event => setTargetRole(event.target.value)} />
              </label>
              <label className="text-sm space-y-2">Department
                <input className="input w-full min-h-11" maxLength={120} placeholder="e.g. CSE, IT, AI & DS, ECE" value={department} onChange={event => setDepartment(event.target.value)} />
              </label>
              <label className="text-sm space-y-2 sm:col-span-2">Company (optional)
                <input className="input w-full min-h-11" maxLength={120} value={targetCompany} onChange={event => setTargetCompany(event.target.value)} />
              </label>
            </div>
            <label className="block text-sm space-y-2">Job description (optional)
              <textarea className="input w-full min-h-24" maxLength={8000} value={jobDescription} onChange={event => setJobDescription(event.target.value)} />
            </label>
            {interviewMode === 'custom' && <fieldset className="space-y-2"><legend className="text-sm font-medium">Areas to practise</legend>
              <div className="flex flex-wrap gap-3">{['PROJECT', 'TECHNICAL_BACKGROUND', 'TEAMWORK', 'BEHAVIORAL', 'AI_USAGE', 'COMPANY_AND_ROLE', 'FAILURE_AND_MISTAKES', 'PRESSURE_AND_STRESS'].map(family => <label key={family} className="text-sm flex items-center gap-2 min-h-11">
                <input type="checkbox" checked={categories.includes(family)} onChange={event => setCategories(old => event.target.checked ? [...old, family] : old.filter(f => f !== family))} />{family.toLowerCase().replaceAll('_', ' ')}
              </label>)}</div>
            </fieldset>}
            <p className="text-sm text-secondary">Your plan&apos;s question allowance still applies. Shorter sessions cover fewer areas. Company context is supplied by you and is not independently verified.</p>
            <p className="text-sm text-secondary">Your resume and interview transcript are saved with your session for feedback. Review <Link href="/privacy" className="underline">privacy details</Link> before starting.</p>
          </section>

          {error ? (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
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
                    <span>Your resume is used to personalize questions before the session starts.</span>
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
