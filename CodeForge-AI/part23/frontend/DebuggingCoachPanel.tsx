/**
 * DebuggingCoachPanel
 * ============================================================================
 * Drop-in panel for CodeForge AI's Debugging Coach. Renders next to the
 * existing Debugging Mode workspace — it never runs code or owns execution
 * state itself, only visualizes coach state and forwards student actions via
 * callbacks (Section 34's product boundary: this component is presentation
 * only; every business rule lives server-side in src/api/handlers.ts).
 *
 * Design: a vertical "signal rail" mirrors a debugger's step timeline —
 * phases genuinely are an ordered sequence here, so numbered/positional
 * markers are earned rather than decorative. Two accent colors separate
 * *evidence* (amber — what's confirmed) from *hypothesis* (cyan — what's
 * still being tested), so the color coding itself teaches the underlying
 * mental model rather than just decorating the panel.
 *
 * Framework-agnostic props — swap `sampleState` for real data from your
 * `GET /coach-state` endpoint and wire the callbacks to the corresponding
 * handlers in src/api/handlers.ts.
 * ============================================================================
 */
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types (kept local/string-based so this file has zero import dependency on
// the backend package — the wire format is plain JSON matching these unions
// anyway).
// ---------------------------------------------------------------------------

export type DebuggingPhase =
  | "OBSERVE"
  | "REPRODUCE"
  | "LOCALIZE"
  | "HYPOTHESIZE"
  | "INVESTIGATE"
  | "EXPERIMENT"
  | "ROOT_CAUSE"
  | "FIX"
  | "VERIFY"
  | "RESOLVED";

export type HypothesisStatus = "PROPOSED" | "TESTING" | "SUPPORTED" | "REJECTED" | "INCONCLUSIVE" | "ABANDONED";

export interface HypothesisView {
  id: string;
  statement: string;
  status: HypothesisStatus;
  distinguishingTargets?: string[];
}

export interface NextBestActionView {
  recommendedAction: string;
  question: string;
  reason: string;
  target?: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface DebuggingCoachPanelProps {
  currentPhase: DebuggingPhase;
  hypotheses: HypothesisView[];
  evidenceAvailable: string[]; // e.g. ["failure", "trace", "complexity"]
  nextBestAction?: NextBestActionView;
  aiAvailable?: boolean;
  onSubmitHypothesis?: (statement: string) => void;
  onRequestGuidance?: () => void;
}

const PHASES: { id: DebuggingPhase; label: string }[] = [
  { id: "OBSERVE", label: "Observe" },
  { id: "REPRODUCE", label: "Reproduce" },
  { id: "LOCALIZE", label: "Localize" },
  { id: "HYPOTHESIZE", label: "Hypothesize" },
  { id: "INVESTIGATE", label: "Investigate" },
  { id: "EXPERIMENT", label: "Experiment" },
  { id: "ROOT_CAUSE", label: "Root cause" },
  { id: "FIX", label: "Fix" },
  { id: "VERIFY", label: "Verify" },
  { id: "RESOLVED", label: "Resolved" },
];

const STATUS_META: Record<HypothesisStatus, { label: string; tone: "hypothesis" | "success" | "danger" | "muted" }> = {
  PROPOSED: { label: "Proposed", tone: "muted" },
  TESTING: { label: "Testing", tone: "hypothesis" },
  SUPPORTED: { label: "Supported", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  INCONCLUSIVE: { label: "Inconclusive", tone: "muted" },
  ABANDONED: { label: "Abandoned", tone: "muted" },
};

export default function DebuggingCoachPanel({
  currentPhase,
  hypotheses,
  evidenceAvailable,
  nextBestAction,
  aiAvailable = true,
  onSubmitHypothesis,
  onRequestGuidance,
}: DebuggingCoachPanelProps) {
  const [draft, setDraft] = useState("");
  const currentIdx = PHASES.findIndex((p) => p.id === currentPhase);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmitHypothesis?.(trimmed);
    setDraft("");
  }

  return (
    <div className="dc-root">
      <style>{CSS}</style>

      <nav className="dc-rail" aria-label="Debugging phase">
        {PHASES.map((phase, i) => {
          const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming";
          return (
            <div key={phase.id} className={`dc-rail-item dc-rail-item--${state}`}>
              <span className="dc-rail-node" aria-hidden="true" />
              <span className="dc-rail-label" aria-current={state === "current" ? "step" : undefined}>
                {phase.label}
              </span>
            </div>
          );
        })}
      </nav>

      <div className="dc-main">
        <section className="dc-coach" aria-live="polite">
          <div className="dc-coach-eyebrow">
            <span className={`dc-dot ${aiAvailable ? "dc-dot--live" : "dc-dot--offline"}`} aria-hidden="true" />
            {aiAvailable ? "Coach" : "Coach — running on saved evidence only"}
          </div>

          {nextBestAction ? (
            <>
              <p className="dc-coach-question">{nextBestAction.question}</p>
              <p className="dc-coach-reason">{nextBestAction.reason}</p>
              <div className="dc-coach-meta">
                <span className="dc-badge dc-badge--mono">{formatAction(nextBestAction.recommendedAction)}</span>
                {nextBestAction.target && <span className="dc-badge dc-badge--mono">{nextBestAction.target}</span>}
                <span className={`dc-badge dc-badge--confidence-${nextBestAction.confidence.toLowerCase()}`}>
                  {nextBestAction.confidence.toLowerCase()} confidence
                </span>
              </div>
            </>
          ) : (
            <p className="dc-coach-question">Ready when you are. Ask for guidance to get your first step.</p>
          )}

          <button type="button" className="dc-button" onClick={() => onRequestGuidance?.()}>
            Ask for guidance
          </button>
        </section>

        <section className="dc-hypotheses">
          <h3 className="dc-section-title">Hypotheses</h3>

          {hypotheses.length === 0 ? (
            <p className="dc-empty">No hypothesis yet — what do you think is going on?</p>
          ) : (
            <ul className="dc-hypothesis-list">
              {hypotheses.map((h) => {
                const meta = STATUS_META[h.status];
                return (
                  <li key={h.id} className="dc-hypothesis-card" tabIndex={0}>
                    <div className="dc-hypothesis-top">
                      <span className={`dc-chip dc-chip--${meta.tone}`}>{meta.label}</span>
                      {h.distinguishingTargets && h.distinguishingTargets.length > 0 && (
                        <span className="dc-badge dc-badge--mono">{h.distinguishingTargets.join(", ")}</span>
                      )}
                    </div>
                    <p className="dc-hypothesis-statement">{h.statement}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="dc-hypothesis-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="dc-sr-only" htmlFor="dc-hypothesis-input">
              Propose a hypothesis
            </label>
            <input
              id="dc-hypothesis-input"
              className="dc-input"
              placeholder="Propose a hypothesis…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="dc-button dc-button--ghost">
              Add
            </button>
          </form>
        </section>

        {evidenceAvailable.length > 0 && (
          <section className="dc-evidence" aria-label="Evidence available">
            <h3 className="dc-section-title">Evidence on hand</h3>
            <div className="dc-evidence-chips">
              {evidenceAvailable.map((e) => (
                <span key={e} className="dc-chip dc-chip--evidence">
                  {e}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function formatAction(action: string): string {
  return action.replaceAll("_", " ").toLowerCase();
}

// ---------------------------------------------------------------------------
// Sample data — for standalone preview only. Replace with real state from
// GET /coach-state.
// ---------------------------------------------------------------------------

export const sampleDebuggingCoachPanelProps: DebuggingCoachPanelProps = {
  currentPhase: "EXPERIMENT",
  evidenceAvailable: ["failure", "trace"],
  aiAvailable: true,
  hypotheses: [
    { id: "h1", statement: "The pointer update runs before the loop's bounds check, so it overshoots by one.", status: "TESTING", distinguishingTargets: ["pointer"] },
    { id: "h2", statement: "The input parser drops the last element for odd-length arrays.", status: "REJECTED" },
  ],
  nextBestAction: {
    recommendedAction: "INSPECT_TRACE",
    target: "pointer",
    question: "What do you expect `pointer` to be at the final step, and what does the trace actually show?",
    reason: "This distinguishes your live hypothesis from the alternative — the trace already captured this value.",
    confidence: "HIGH",
  },
};

// ---------------------------------------------------------------------------
// Styles — scoped via a unique class prefix so this drops into any styling
// setup (Tailwind, CSS modules, plain CSS) without collisions. Respects
// prefers-reduced-motion; visible focus rings throughout; rail collapses to
// a horizontal strip under 720px.
// ---------------------------------------------------------------------------

const CSS = `
.dc-root {
  --dc-bg: #10151f;
  --dc-surface: #1b2333;
  --dc-surface-raised: #232d42;
  --dc-border: #2c3750;
  --dc-text: #e8ecf3;
  --dc-text-muted: #8894ac;
  --dc-evidence: #d9a441;
  --dc-hypothesis: #5fd4d0;
  --dc-success: #7fb88a;
  --dc-danger: #c4674f;
  --dc-font-display: 'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif;
  --dc-font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --dc-font-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;

  display: flex;
  gap: 24px;
  background: var(--dc-bg);
  color: var(--dc-text);
  font-family: var(--dc-font-body);
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--dc-border);
  max-width: 780px;
}

.dc-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 132px;
  padding-top: 4px;
}

.dc-rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  padding: 7px 0;
}

.dc-rail-item::before {
  content: "";
  position: absolute;
  left: 5px;
  top: -2px;
  bottom: -2px;
  width: 1px;
  background: var(--dc-border);
  z-index: 0;
}

.dc-rail-item:first-child::before { top: 50%; }
.dc-rail-item:last-child::before { bottom: 50%; }

.dc-rail-node {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--dc-border);
  background: var(--dc-bg);
  z-index: 1;
  flex-shrink: 0;
}

.dc-rail-item--done .dc-rail-node {
  background: var(--dc-hypothesis);
  border-color: var(--dc-hypothesis);
}

.dc-rail-item--current .dc-rail-node {
  background: var(--dc-evidence);
  border-color: var(--dc-evidence);
  box-shadow: 0 0 0 4px rgba(217, 164, 65, 0.22);
  animation: dc-pulse 2.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .dc-rail-item--current .dc-rail-node { animation: none; }
}

@keyframes dc-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(217, 164, 65, 0.22); }
  50% { box-shadow: 0 0 0 7px rgba(217, 164, 65, 0.10); }
}

.dc-rail-label {
  font-family: var(--dc-font-mono);
  font-size: 12.5px;
  letter-spacing: 0.01em;
  color: var(--dc-text-muted);
}

.dc-rail-item--done .dc-rail-label,
.dc-rail-item--current .dc-rail-label {
  color: var(--dc-text);
}

.dc-rail-item--current .dc-rail-label { font-weight: 600; }

.dc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dc-coach {
  background: var(--dc-surface);
  border: 1px solid var(--dc-border);
  border-left: 3px solid var(--dc-evidence);
  border-radius: 10px;
  padding: 16px 18px;
}

.dc-coach-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--dc-font-mono);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dc-text-muted);
  margin-bottom: 10px;
}

.dc-dot { width: 7px; height: 7px; border-radius: 50%; }
.dc-dot--live { background: var(--dc-success); }
.dc-dot--offline { background: var(--dc-text-muted); }

.dc-coach-question {
  font-family: var(--dc-font-display);
  font-size: 18px;
  line-height: 1.4;
  margin: 0 0 8px;
}

.dc-coach-reason {
  font-size: 13.5px;
  color: var(--dc-text-muted);
  margin: 0 0 12px;
  line-height: 1.5;
}

.dc-coach-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.dc-badge {
  font-family: var(--dc-font-mono);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  background: var(--dc-surface-raised);
  color: var(--dc-text-muted);
  border: 1px solid var(--dc-border);
}

.dc-badge--confidence-high { color: var(--dc-success); }
.dc-badge--confidence-medium { color: var(--dc-evidence); }
.dc-badge--confidence-low { color: var(--dc-text-muted); }

.dc-button {
  font-family: var(--dc-font-body);
  font-size: 13.5px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 7px;
  border: 1px solid var(--dc-evidence);
  background: var(--dc-evidence);
  color: #1a1305;
  cursor: pointer;
}

.dc-button:hover { filter: brightness(1.08); }
.dc-button:focus-visible, .dc-input:focus-visible, .dc-hypothesis-card:focus-visible {
  outline: 2px solid var(--dc-hypothesis);
  outline-offset: 2px;
}

.dc-button--ghost {
  background: transparent;
  border-color: var(--dc-border);
  color: var(--dc-text);
}

.dc-section-title {
  font-family: var(--dc-font-mono);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dc-text-muted);
  margin: 0 0 10px;
  font-weight: 500;
}

.dc-empty {
  font-size: 13.5px;
  color: var(--dc-text-muted);
  font-style: italic;
  margin: 0 0 12px;
}

.dc-hypothesis-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dc-hypothesis-card {
  background: var(--dc-surface);
  border: 1px solid var(--dc-border);
  border-radius: 9px;
  padding: 11px 13px;
}

.dc-hypothesis-top {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.dc-hypothesis-statement {
  font-size: 13.5px;
  line-height: 1.5;
  margin: 0;
}

.dc-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  letter-spacing: 0.01em;
}

.dc-chip--hypothesis { background: rgba(95, 212, 208, 0.16); color: var(--dc-hypothesis); }
.dc-chip--success { background: rgba(127, 184, 138, 0.16); color: var(--dc-success); }
.dc-chip--danger { background: rgba(196, 103, 79, 0.16); color: var(--dc-danger); }
.dc-chip--muted { background: rgba(136, 148, 172, 0.14); color: var(--dc-text-muted); }
.dc-chip--evidence { background: rgba(217, 164, 65, 0.14); color: var(--dc-evidence); font-family: var(--dc-font-mono); font-weight: 500; }

.dc-hypothesis-form {
  display: flex;
  gap: 8px;
}

.dc-input {
  flex: 1;
  background: var(--dc-surface);
  border: 1px solid var(--dc-border);
  border-radius: 7px;
  padding: 8px 11px;
  color: var(--dc-text);
  font-family: var(--dc-font-body);
  font-size: 13.5px;
}

.dc-input::placeholder { color: var(--dc-text-muted); }

.dc-evidence-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dc-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 720px) {
  .dc-root { flex-direction: column; }
  .dc-rail { flex-direction: row; flex-wrap: wrap; gap: 10px 14px; }
  .dc-rail-item::before { display: none; }
  .dc-rail-label { display: none; }
  .dc-rail-item--current .dc-rail-label { display: inline; }
}
`;
