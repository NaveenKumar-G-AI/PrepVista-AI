'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-pine focus:outline-none';
const labelClass = 'block font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5';

export function OutcomeActions({
  opportunityId,
  isRejected,
  existingRecoveryPlanId,
}: {
  opportunityId: string;
  isRejected: boolean;
  existingRecoveryPlanId: string | null;
}) {
  const router = useRouter();
  const [startingRecovery, setStartingRecovery] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [recruiterFeedbackText, setRecruiterFeedbackText] = useState('');
  const [studentReflectionText, setStudentReflectionText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartRecovery() {
    setError(null);
    setStartingRecovery(true);
    try {
      const res = await fetch('/api/career/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not generate a recovery plan.');
        setStartingRecovery(false);
        return;
      }
      router.push(`/career/recovery/${data.plan.id}`);
    } catch {
      setError('Could not reach the server. Please try again.');
      setStartingRecovery(false);
    }
  }

  async function handleAddFeedback(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!recruiterFeedbackText.trim() && !studentReflectionText.trim()) {
      setError('Add some feedback text first.');
      return;
    }
    setSubmittingFeedback(true);
    try {
      const res = await fetch(`/api/career/outcomes/${opportunityId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiterFeedbackText, studentReflectionText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save feedback.');
        setSubmittingFeedback(false);
        return;
      }
      setRecruiterFeedbackText('');
      setStudentReflectionText('');
      setShowFeedbackForm(false);
      setSubmittingFeedback(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
      setSubmittingFeedback(false);
    }
  }

  if (!isRejected) {
    return <p className="text-sm text-muted">Nothing further needed for this outcome right now.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {existingRecoveryPlanId ? (
          <LinkButton href={`/career/recovery/${existingRecoveryPlanId}`}>View Recovery Plan</LinkButton>
        ) : (
          <Button onClick={handleStartRecovery} disabled={startingRecovery}>
            {startingRecovery ? 'Generating…' : 'Start Recovery'}
          </Button>
        )}
        <button
          type="button"
          onClick={() => setShowFeedbackForm((v) => !v)}
          className="font-mono text-xs uppercase tracking-[0.08em] text-pine hover:underline"
        >
          {showFeedbackForm ? 'Cancel' : '+ Add feedback'}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-clay-strong">{error}</p>}

      {showFeedbackForm && (
        <Card className="max-w-xl">
          <form onSubmit={handleAddFeedback} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="af-recruiter">Recruiter feedback</label>
              <textarea
                id="af-recruiter"
                className={`${inputClass} min-h-20`}
                value={recruiterFeedbackText}
                onChange={(e) => setRecruiterFeedbackText(e.target.value)}
                placeholder="Paste it exactly as received."
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="af-reflection">Your own reflection</label>
              <textarea
                id="af-reflection"
                className={`${inputClass} min-h-16`}
                value={studentReflectionText}
                onChange={(e) => setStudentReflectionText(e.target.value)}
                placeholder="What is your own sense of how it went?"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submittingFeedback}>
                {submittingFeedback ? 'Saving…' : 'Save Feedback'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
