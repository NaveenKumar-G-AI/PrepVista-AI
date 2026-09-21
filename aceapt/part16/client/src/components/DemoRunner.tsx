import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { AuthContext } from '../api/client';
import { DemoStep } from '../types';
import { SignalRow, ConfidenceTag, RootCauseTag } from './SignalPrimitives';
import { ErrorDeconstructionView } from './ErrorDeconstructionView';

const STAGE_LABELS: Record<DemoStep['stage'], string> = {
  BEFORE: 'Before',
  DIAGNOSE: 'Diagnose',
  INTERVENE: 'Intervene',
  VERIFY: 'Verify',
  UPDATED_STATE: 'Updated state',
  UPDATED_JOURNEY: 'Updated journey',
};

interface Props {
  onAuthReady: (auth: AuthContext) => void;
}

export function DemoRunner({ onAuthReady }: Props) {
  const [steps, setSteps] = useState<DemoStep[] | null>(null);
  const [revealCount, setRevealCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    setLoading(true);
    try {
      const res = await api.runDemo();
      setSteps(res.steps);
      setRevealCount(1);
      onAuthReady({ studentId: res.studentId, token: res.token });
    } finally {
      setLoading(false);
    }
  }

  if (!steps) {
    return (
      <div className="rounded-md border border-line bg-surface p-8 text-center shadow-panel">
        <Sparkles className="mx-auto mb-3 text-signal-gold" size={22} />
        <p className="font-display text-xl font-medium text-ink">Profit &amp; Loss, end to end</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
          A student gets a reverse-percentage problem wrong. Watch the engine tell a strategy gap apart from a concept
          gap, choose an intervention, verify it worked, and hand new evidence to Feature 14 and Feature 15 — all through
          real API calls to the server in this project.
        </p>
        <button
          onClick={handleRun}
          disabled={loading}
          className="mt-6 rounded-sm bg-ink px-5 py-2.5 font-body text-[13px] font-medium text-porcelain transition hover:bg-ink-soft disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run the guided demo'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {steps.slice(0, revealCount).map((step, i) => (
        <div key={i} className={`rounded-md border bg-surface shadow-panel transition ${i === revealCount - 1 ? 'border-signal-gold/50' : 'border-line'}`}>
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
            <span className="font-mono text-[11px] font-medium text-signal-gold">{String(i + 1).padStart(2, '0')}</span>
            <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">{STAGE_LABELS[step.stage]}</p>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-[14px] font-medium text-ink">{step.title}</p>
            <StageDetail step={step} />
          </div>
        </div>
      ))}

      {revealCount < steps.length && (
        <button
          onClick={() => setRevealCount((c) => c + 1)}
          className="flex items-center gap-2 rounded-sm bg-ink px-4 py-2.5 font-body text-[13px] font-medium text-porcelain transition hover:bg-ink-soft"
        >
          Continue <ArrowRight size={14} />
        </button>
      )}

      {revealCount >= steps.length && (
        <button
          onClick={handleRun}
          className="rounded-sm border border-line bg-surface px-4 py-2.5 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain"
        >
          Run again
        </button>
      )}
    </div>
  );
}

function StageDetail({ step }: { step: DemoStep }) {
  const d = step.detail;

  switch (step.stage) {
    case 'BEFORE':
      return (
        <div className="space-y-2">
          <p className="rounded-sm bg-porcelain px-3.5 py-2.5 text-[13px] text-ink">{d.question}</p>
          <p className="text-[12px] text-muted">
            Student answered <span className="font-medium text-signal-rose">{d.studentAnswer}</span> — correct answer was{' '}
            <span className="font-medium text-signal-teal">{d.correctAnswer}</span>.
          </p>
        </div>
      );

    case 'DIAGNOSE':
      return (
        <div className="space-y-4">
          <div className="rounded-sm border border-line">
            <div className="px-3.5">
              <SignalRow label="Concept" status={d.uiPanel.conceptStatus} />
              <SignalRow label="Method" status={d.uiPanel.methodStatus} />
              <SignalRow label="Calculation" status={d.uiPanel.calculationStatus} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RootCauseTag cause={d.primaryCause.cause} />
            <ConfidenceTag confidence={d.primaryCause.confidence} />
          </div>
          <p className="text-[13px] leading-relaxed text-ink-soft">{d.primaryCause.evidence}</p>
          {d.errorDeconstruction && <ErrorDeconstructionView result={{ available: true, ...d.errorDeconstruction }} />}
        </div>
      );

    case 'INTERVENE':
      return (
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-muted">{d.rationale}</p>
          <ol className="space-y-2.5">
            {d.sequence.map((s: any, i: number) => (
              <li key={i} className="rounded-sm border border-line px-3.5 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-wide text-signal-gold">{s.step}</p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {typeof s.content === 'string' ? s.content : s.content?.prompt}
                </p>
              </li>
            ))}
          </ol>
        </div>
      );

    case 'VERIFY':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sm bg-porcelain px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase text-muted">Independent problem</p>
              <p className="text-[13px] font-medium text-signal-teal">Correct</p>
            </div>
            <div className="rounded-sm bg-porcelain px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase text-muted">Transfer challenge</p>
              <p className="text-[13px] font-medium text-signal-teal">Correct</p>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-soft">{d.effectiveness?.note}</p>
        </div>
      );

    case 'UPDATED_STATE':
      return (
        <div className="flex gap-2">
          <span className="rounded-full bg-signal-tealSoft px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-signal-teal">
            Mastery: {d.currentState.masteryState}
          </span>
          <span className="rounded-full bg-signal-tealSoft px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-signal-teal">
            Transfer: {d.currentState.transferState}
          </span>
        </div>
      );

    case 'UPDATED_JOURNEY':
      return <p className="text-[13px] leading-relaxed text-ink-soft">{d.journeyUpdate?.note}</p>;

    default:
      return null;
  }
}
