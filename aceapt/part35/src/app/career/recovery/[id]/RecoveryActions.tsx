'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardEyebrow } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Tags';
import { Button } from '@/components/ui/Button';
import type { Reassessment, ReassessmentResult, RecoveryAction, RecoveryPlan } from '@/lib/types';

const STEPS: { key: RecoveryPlan['status'] | 'reassessed'; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'started', label: 'Started' },
  { key: 'completed', label: 'Completed' },
  { key: 'reassessed', label: 'Reassessed' },
];

const RESULT_OPTIONS: { value: ReassessmentResult; label: string }[] = [
  { value: 'improved', label: 'Improved' },
  { value: 'no_change', label: 'No measurable change' },
  { value: 'declined', label: 'Declined' },
  { value: 'unclear', label: 'Unclear' },
];

function Stepper({ status, hasReassessment }: { status: RecoveryPlan['status']; hasReassessment: boolean }) {
  const currentIndex = hasReassessment ? 3 : STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-2 mb-8" aria-label="Recovery plan progress">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${i <= currentIndex ? 'bg-pine' : 'bg-line'}`}
              aria-hidden="true"
            />
            <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${i <= currentIndex ? 'text-ink' : 'text-muted'}`}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

export function RecoveryActions({
  plan,
  actions,
  reassessments,
}: {
  plan: RecoveryPlan;
  actions: RecoveryAction[];
  reassessments: Reassessment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReassessmentResult>('improved');
  const [notes, setNotes] = useState('');

  const primary = actions.find((a) => a.actionType === 'primary');
  const canComplete = primary?.status === 'completed';

  async function post(url: string, body?: object) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setBusy(false);
        return false;
      }
      router.refresh();
      setBusy(false);
      return true;
    } catch {
      setError('Could not reach the server. Please try again.');
      setBusy(false);
      return false;
    }
  }

  async function handleReassess(e: React.FormEvent) {
    e.preventDefault();
    await post(`/api/career/recovery/${plan.id}/reassess`, { result, notes: notes || null });
  }

  return (
    <div>
      <Stepper status={plan.status} hasReassessment={reassessments.length > 0} />

      {plan.status === 'recommended' && (
        <Button onClick={() => post(`/api/career/recovery/${plan.id}/start`)} disabled={busy}>
          {busy ? 'Starting…' : 'Start Recovery'}
        </Button>
      )}

      {plan.status !== 'recommended' && (
        <>
          <CardEyebrow>Actions</CardEyebrow>
          <div className="mt-3 space-y-3">
            {actions.map((action) => (
              <Card key={action.id} className="p-4 flex items-start gap-4">
                <button
                  type="button"
                  disabled={plan.status === 'completed' || busy}
                  onClick={() => post(`/api/career/recovery/${plan.id}/actions`, { actionId: action.id })}
                  aria-pressed={action.status === 'completed'}
                  aria-label={action.status === 'completed' ? `Mark "${action.title}" as not done` : `Mark "${action.title}" as done`}
                  className={`mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs ${
                    action.status === 'completed' ? 'bg-pine border-pine text-white' : 'border-line text-transparent'
                  } disabled:cursor-not-allowed`}
                >
                  ✓
                </button>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-ink">{action.title}</p>
                    {action.actionType === 'primary' && <Badge tone="pine">Primary</Badge>}
                  </div>
                  <p className="text-sm text-muted leading-relaxed">{action.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-clay-strong">{error}</p>}

      {plan.status === 'started' && (
        <div className="mt-6">
          <Button onClick={() => post(`/api/career/recovery/${plan.id}/complete`)} disabled={busy || !canComplete}>
            Mark Recovery Complete
          </Button>
          {!canComplete && <p className="mt-2 text-xs text-muted">Complete the primary action first.</p>}
        </div>
      )}

      {plan.status === 'completed' && reassessments.length === 0 && (
        <Card className="mt-6 max-w-lg">
          <CardEyebrow>Reassessment</CardEyebrow>
          <p className="text-sm text-muted mb-4">
            Did the relevant capability change after completing this recovery plan?
          </p>
          <form onSubmit={handleReassess} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {RESULT_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setResult(o.value)}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    result === o.value ? 'border-pine bg-pine-soft text-pine' : 'border-line text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-pine focus:outline-none min-h-20"
              placeholder="Optional notes on what changed"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save Reassessment'}
            </Button>
          </form>
        </Card>
      )}

      {reassessments.length > 0 && (
        <Card className="mt-6 max-w-lg">
          <CardEyebrow>Reassessment Result</CardEyebrow>
          {reassessments.map((r) => (
            <div key={r.id} className="mb-2 last:mb-0">
              <Badge tone={r.result === 'improved' ? 'pine' : r.result === 'declined' ? 'clay' : 'neutral'}>
                {RESULT_OPTIONS.find((o) => o.value === r.result)?.label ?? r.result}
              </Badge>
              {r.notes && <p className="mt-2 text-sm text-ink leading-relaxed">{r.notes}</p>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
