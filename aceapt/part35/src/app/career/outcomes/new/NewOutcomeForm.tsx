'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { STAGE_ORDER } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/constants';
import type { StageStatus, TargetAlignment } from '@/lib/types';

const STATUS_OPTIONS: { value: StageStatus; label: string }[] = [
  { value: 'rejected', label: 'Not selected' },
  { value: 'passed', label: 'Advanced / cleared this stage' },
  { value: 'offer_received', label: 'Offer received' },
  { value: 'pending', label: 'Awaiting result' },
  { value: 'withdrawn', label: 'I withdrew' },
];

const ALIGNMENT_OPTIONS: { value: TargetAlignment; label: string }[] = [
  { value: 'unknown', label: 'Not sure' },
  { value: 'aligned', label: 'Aligned with my target' },
  { value: 'partial', label: 'Partially aligned' },
  { value: 'misaligned', label: 'Not really aligned' },
];

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-pine focus:outline-none';
const labelClass = 'block font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5';

export function NewOutcomeForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [roleCategory, setRoleCategory] = useState('');
  const [source, setSource] = useState('');
  const [targetAlignment, setTargetAlignment] = useState<TargetAlignment>('unknown');
  const [furthestStageKey, setFurthestStageKey] = useState(STAGE_ORDER[0]);
  const [furthestStageStatus, setFurthestStageStatus] = useState<StageStatus>('rejected');
  const [customStageLabel, setCustomStageLabel] = useState('');
  const [recruiterFeedbackText, setRecruiterFeedbackText] = useState('');
  const [studentReflectionText, setStudentReflectionText] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyName.trim() || !roleTitle.trim() || !roleCategory.trim()) {
      setError('Company, role title, and role category are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/career/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          roleTitle,
          roleCategory,
          source: source || null,
          targetAlignment,
          furthestStageKey,
          furthestStageStatus,
          customStageLabel: customStageLabel || null,
          recruiterFeedbackText: recruiterFeedbackText || null,
          studentReflectionText: studentReflectionText || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      router.push(`/career/outcomes/${data.opportunity.id}`);
    } catch {
      setError('Could not reach the server. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="companyName">Company</label>
            <input
              id="companyName"
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Meridian Systems"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="roleTitle">Role Title</label>
            <input
              id="roleTitle"
              className={inputClass}
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Backend Developer"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="roleCategory">Role Category</label>
            <input
              id="roleCategory"
              className={inputClass}
              value={roleCategory}
              onChange={(e) => setRoleCategory(e.target.value)}
              placeholder="e.g. Backend Developer"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="source">Source (optional)</label>
            <input
              id="source"
              className={inputClass}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. campus drive, referral"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="targetAlignment">Alignment with your target role</label>
            <select
              id="targetAlignment"
              className={inputClass}
              value={targetAlignment}
              onChange={(e) => setTargetAlignment(e.target.value as TargetAlignment)}
            >
              {ALIGNMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-4">Stage Reached</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="furthestStageKey">Furthest stage reached</label>
            <select
              id="furthestStageKey"
              className={inputClass}
              value={furthestStageKey}
              onChange={(e) => setFurthestStageKey(e.target.value as typeof STAGE_ORDER[number])}
            >
              {STAGE_ORDER.map((key) => (
                <option key={key} value={key}>{STAGE_LABELS[key]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="furthestStageStatus">What happened at that stage</label>
            <select
              id="furthestStageStatus"
              className={inputClass}
              value={furthestStageStatus}
              onChange={(e) => setFurthestStageStatus(e.target.value as StageStatus)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="customStageLabel">
              Custom stage label (optional — if this company used a different process)
            </label>
            <input
              id="customStageLabel"
              className={inputClass}
              value={customStageLabel}
              onChange={(e) => setCustomStageLabel(e.target.value)}
              placeholder='e.g. "Case Study Round"'
            />
          </div>
        </div>
      </Card>

      <Card>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-4">Evidence (optional)</p>
        <div className="space-y-5">
          <div>
            <label className={labelClass} htmlFor="recruiterFeedbackText">Recruiter feedback, if any</label>
            <textarea
              id="recruiterFeedbackText"
              className={`${inputClass} min-h-24`}
              value={recruiterFeedbackText}
              onChange={(e) => setRecruiterFeedbackText(e.target.value)}
              placeholder="Paste it exactly as received. ACEAPT will never invent a reason you were not given."
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="studentReflectionText">Your own reflection, if any</label>
            <textarea
              id="studentReflectionText"
              className={`${inputClass} min-h-20`}
              value={studentReflectionText}
              onChange={(e) => setStudentReflectionText(e.target.value)}
              placeholder="What is your own sense of how it went? This is treated as a possible contributor, not confirmed evidence."
            />
          </div>
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-clay-strong">{error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Outcome'}
        </Button>
      </div>
    </form>
  );
}
