import { useEffect, useMemo, useRef, useState } from 'react';
import type { SubmissionStatus, Verdict } from '../domain/enums.js';

/**
 * CodeForge AI — Submission System
 * Integrates into the existing coding workspace next to the editor — this is
 * deliberately NOT a full page. Shows only real, server-reported states (spec: "NO FAKE
 * PROGRESS... never display fabricated numerical progress"); the "forge glow" bar's
 * color temperature is a genuine encoding of pipeline stage, not decoration, and every
 * state also has a text label + icon so nothing here is color-only (spec:
 * "non-color-only feedback"). Styling is a scoped <style> tag rather than Tailwind
 * classes so this drops into any host app's styling system unmodified — swap for the
 * real design tokens if CodeForge's workspace already uses Tailwind/CSS modules.
 */

export interface SubmissionResultView {
  verdict: Verdict;
  score: number;
  compilationStatus: 'NOT_REQUIRED' | 'SUCCESS' | 'FAILED';
  compilationOutput: string | null;
  publicResult: { totalTests: number; passed: number; failed: number; cases: { name: string; passed: boolean; wallMs: number }[] };
  hiddenResult: { totalGroups: number; passedGroups: number; totalWeight: number; earnedWeight: number };
  resourceUsage: { cpuMs: number; memoryKb: number; wallMs: number; outputBytes: number };
  terminationReason: string | null;
}

export interface SubmissionStatusPanelProps {
  status: SubmissionStatus;
  submissionNumber: number;
  language: string;
  result: SubmissionResultView | null;
  onCancel?: () => void;
  /** Called on an interval while non-terminal; the panel itself holds no fetch logic —
   * see useSubmissionPolling.ts for the default polling implementation, swappable for
   * Supabase Realtime once that's wired into the host app. */
}

const STAGE_ORDER: SubmissionStatus[] = ['SUBMITTED', 'VALIDATING', 'QUEUED', 'COMPILING', 'RUNNING', 'EVALUATING', 'COMPLETED'];

const STAGE_LABEL: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  VALIDATING: 'Submitted',
  QUEUED: 'Queued',
  COMPILING: 'Compiling',
  RUNNING: 'Running',
  EVALUATING: 'Evaluating',
  COMPLETED: 'Result',
  FAILED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  JUDGE_ERROR: 'Evaluation service error',
};

// Color temperature 0 (cool blue, just arrived) -> 1 (hottest, mid-execution). This IS
// the progress signal — there is no numeric progress bar anywhere in this component.
const STAGE_TEMPERATURE: Partial<Record<SubmissionStatus, number>> = {
  SUBMITTED: 0,
  VALIDATING: 0.1,
  QUEUED: 0.25,
  COMPILING: 0.5,
  RUNNING: 0.75,
  EVALUATING: 0.9,
};

function temperatureToColor(t: number): string {
  // Cool slate-blue -> molten orange, interpolated in HSL for a smooth "heating" feel.
  const hue = 210 - t * 190; // 210 (blue) down to ~20 (orange)
  const sat = 55 + t * 30;
  const light = 55 - t * 8;
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

const VERDICT_META: Record<Verdict, { label: string; tone: 'good' | 'bad' | 'neutral'; icon: string }> = {
  ACCEPTED: { label: 'Accepted', tone: 'good', icon: '✓' },
  WRONG_ANSWER: { label: 'Wrong Answer', tone: 'bad', icon: '✕' },
  COMPILATION_ERROR: { label: 'Compilation Error', tone: 'bad', icon: '⚠' },
  RUNTIME_ERROR: { label: 'Runtime Error', tone: 'bad', icon: '⚠' },
  TIME_LIMIT_EXCEEDED: { label: 'Time Limit Exceeded', tone: 'bad', icon: '⏱' },
  MEMORY_LIMIT_EXCEEDED: { label: 'Memory Limit Exceeded', tone: 'bad', icon: '⚠' },
  OUTPUT_LIMIT_EXCEEDED: { label: 'Output Limit Exceeded', tone: 'bad', icon: '⚠' },
  SYSTEM_ERROR: { label: 'System Error', tone: 'neutral', icon: 'ℹ' },
  JUDGE_ERROR: { label: 'Evaluation Service Error', tone: 'neutral', icon: 'ℹ' },
};

export function SubmissionStatusPanel({ status, submissionNumber, language, result, onCancel }: SubmissionStatusPanelProps) {
  const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'JUDGE_ERROR'].includes(status);
  const isCancellable = ['QUEUED', 'COMPILING', 'RUNNING', 'EVALUATING'].includes(status);
  const temperature = STAGE_TEMPERATURE[status] ?? 0;
  const glowColor = temperatureToColor(temperature);

  const verdictMeta = result ? VERDICT_META[result.verdict] : null;
  const isInfrastructureIssue = status === 'JUDGE_ERROR';

  const liveMessage = isTerminal
    ? verdictMeta
      ? `${verdictMeta.label}. Score ${result?.score ?? 0} percent.`
      : STAGE_LABEL[status]
    : `Submission ${submissionNumber}: ${STAGE_LABEL[status]}`;

  return (
    <div className="cf-panel" data-status={status}>
      <style>{PANEL_CSS}</style>

      <div className="cf-header">
        <span className="cf-subnum">Submission #{submissionNumber}</span>
        <span className="cf-lang">{language}</span>
      </div>

      {!isTerminal && (
        <div className="cf-glow-track" aria-hidden="true">
          <div className="cf-glow-fill" style={{ width: `${Math.round(temperature * 100)}%`, background: glowColor, boxShadow: `0 0 12px ${glowColor}` }} />
        </div>
      )}

      <div className="cf-status-row" role="status" aria-live="polite">
        {!isTerminal && <span className="cf-spinner" aria-hidden="true" style={{ borderTopColor: glowColor }} />}
        {isTerminal && verdictMeta && (
          <span className={`cf-badge cf-badge--${verdictMeta.tone}`} aria-hidden="true">
            {verdictMeta.icon}
          </span>
        )}
        <span className="cf-status-text">{liveMessage}</span>
      </div>

      {!isTerminal && (
        <ol className="cf-stage-list" aria-hidden="true">
          {STAGE_ORDER.filter((s) => s !== 'SUBMITTED' || status === 'SUBMITTED').map((stage) => {
            const stageIndex = STAGE_ORDER.indexOf(stage);
            const currentIndex = STAGE_ORDER.indexOf(status);
            const reached = stageIndex <= currentIndex;
            return (
              <li key={stage} className={reached ? 'cf-stage cf-stage--reached' : 'cf-stage'}>
                {STAGE_LABEL[stage]}
              </li>
            );
          })}
        </ol>
      )}

      {isCancellable && onCancel && (
        <button type="button" className="cf-cancel-btn" onClick={onCancel}>
          Cancel submission
        </button>
      )}

      {isInfrastructureIssue && (
        <p className="cf-infra-note">
          The evaluation service could not complete this submission. Your code was not marked incorrect. You can wait for an automatic
          retry or contact your instructor if this persists.
        </p>
      )}

      {status === 'COMPLETED' && result && <ResultDetail result={result} />}
    </div>
  );
}

function ResultDetail({ result }: { result: SubmissionResultView }) {
  const meta = VERDICT_META[result.verdict];
  return (
    <div className="cf-result">
      <div className="cf-score-row">
        <span className="cf-score">{result.score}%</span>
        <span className={`cf-verdict-pill cf-verdict-pill--${meta.tone}`}>
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
        </span>
      </div>

      <dl className="cf-metrics">
        <div>
          <dt>Public tests</dt>
          <dd>
            {result.publicResult.passed}/{result.publicResult.totalTests} passed
          </dd>
        </div>
        <div>
          <dt>Hidden tests</dt>
          <dd>
            {result.hiddenResult.passedGroups}/{result.hiddenResult.totalGroups} groups passed
          </dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{result.resourceUsage.wallMs} ms</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>{(result.resourceUsage.memoryKb / 1024).toFixed(1)} MB</dd>
        </div>
      </dl>

      {result.publicResult.cases.length > 0 && (
        <ul className="cf-case-list">
          {result.publicResult.cases.map((c) => (
            <li key={c.name} className={c.passed ? 'cf-case cf-case--pass' : 'cf-case cf-case--fail'}>
              <span aria-hidden="true">{c.passed ? '✓' : '✕'}</span>
              <span>{c.name}</span>
              <span className="cf-case-time">{c.wallMs}ms</span>
            </li>
          ))}
        </ul>
      )}

      {result.compilationStatus === 'FAILED' && result.compilationOutput && (
        <pre className="cf-compile-output">{result.compilationOutput}</pre>
      )}
    </div>
  );
}

/**
 * Default status source: polling. Swap the body of this hook for a Supabase Realtime
 * channel subscription once wired into the real app — the component above doesn't care
 * which one feeds it, it only needs { status, result }.
 */
export function useSubmissionPolling(
  submissionId: string,
  fetchStatus: (id: string) => Promise<{ status: SubmissionStatus; result: SubmissionResultView | null }>,
  intervalMs = 1500,
) {
  const [state, setState] = useState<{ status: SubmissionStatus; result: SubmissionResultView | null } | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (stopped.current) return;
      try {
        const next = await fetchStatus(submissionId);
        if (stopped.current) return;
        setState(next);
        const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'JUDGE_ERROR'].includes(next.status);
        if (!isTerminal) timer = setTimeout(poll, intervalMs);
      } catch {
        // Network hiccup: the submission continues server-side regardless (spec,
        // "NETWORK FAILURE UX") — just retry on the next tick rather than surfacing
        // a scary error for a transient client-side blip.
        if (!stopped.current) timer = setTimeout(poll, intervalMs);
      }
    }
    void poll();

    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [submissionId, fetchStatus, intervalMs]);

  return state;
}

const PANEL_CSS = `
.cf-panel {
  --cf-bg: #14161a;
  --cf-surface: #1c1f26;
  --cf-border: #2a2e37;
  --cf-text: #e8e6e1;
  --cf-text-dim: #9a9fab;
  --cf-good: #3ddc97;
  --cf-bad: #ff4d6a;
  background: var(--cf-surface);
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  padding: 16px 18px;
  color: var(--cf-text);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  max-width: 480px;
}
.cf-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.cf-subnum { font-weight: 600; font-size: 13px; color: var(--cf-text-dim); }
.cf-lang { font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 12px; color: var(--cf-text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
.cf-glow-track { height: 4px; border-radius: 2px; background: #23262e; overflow: hidden; margin-bottom: 12px; }
.cf-glow-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease, background 0.4s ease; }
.cf-status-row { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; }
.cf-status-text { line-height: 1.3; }
.cf-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid #3a3f4a; border-top-color: #999;
  animation: cf-spin 0.8s linear infinite; flex-shrink: 0;
}
@media (prefers-reduced-motion: reduce) { .cf-spinner { animation: none; } }
@keyframes cf-spin { to { transform: rotate(360deg); } }
.cf-badge { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px; flex-shrink: 0; }
.cf-badge--good { background: var(--cf-good); color: #08261a; }
.cf-badge--bad { background: var(--cf-bad); color: #2a0510; }
.cf-badge--neutral { background: #8b93a3; color: #1a1d22; }
.cf-stage-list { display: flex; flex-wrap: wrap; gap: 4px 10px; list-style: none; margin: 10px 0 0; padding: 0; font-size: 11px; color: var(--cf-text-dim); }
.cf-stage--reached { color: var(--cf-text); font-weight: 600; }
.cf-stage:not(:last-child)::after { content: '\\2192'; margin-left: 10px; color: var(--cf-text-dim); }
.cf-cancel-btn { margin-top: 12px; background: transparent; border: 1px solid var(--cf-border); color: var(--cf-text-dim); font-size: 12px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
.cf-cancel-btn:hover { border-color: var(--cf-bad); color: var(--cf-bad); }
.cf-infra-note { margin-top: 10px; font-size: 12px; color: var(--cf-text-dim); line-height: 1.5; background: #23262e; border-radius: 6px; padding: 8px 10px; }
.cf-result { margin-top: 14px; border-top: 1px solid var(--cf-border); padding-top: 12px; }
.cf-score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.cf-score { font-size: 22px; font-weight: 700; font-family: ui-monospace, "JetBrains Mono", monospace; }
.cf-verdict-pill { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px; }
.cf-verdict-pill--good { background: rgba(61,220,151,0.15); color: var(--cf-good); }
.cf-verdict-pill--bad { background: rgba(255,77,106,0.15); color: var(--cf-bad); }
.cf-verdict-pill--neutral { background: rgba(139,147,163,0.15); color: #b7bdc9; }
.cf-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px; margin: 0 0 10px; }
.cf-metrics dt { color: var(--cf-text-dim); }
.cf-metrics dd { margin: 0; font-family: ui-monospace, "JetBrains Mono", monospace; }
.cf-case-list { list-style: none; margin: 0; padding: 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.cf-case { display: flex; align-items: center; gap: 6px; }
.cf-case--pass { color: var(--cf-good); }
.cf-case--fail { color: var(--cf-bad); }
.cf-case-time { margin-left: auto; color: var(--cf-text-dim); font-family: ui-monospace, monospace; }
.cf-compile-output { margin-top: 10px; background: #0f1114; border-radius: 6px; padding: 10px; font-size: 11px; overflow-x: auto; color: #ffb4a0; font-family: ui-monospace, "JetBrains Mono", monospace; }
`;

void useMemo; // reserved for a future memoized derived-stage computation if this panel grows
