/**
 * Reference coaching panel for the CodeForge coding workspace.
 *
 * ILLUSTRATIVE ONLY — not part of the type-checked `src/` package (needs
 * `react` installed, which this workspace doesn't assume). Drop it into
 * your workspace layout next to the editor and submission panel.
 *
 * Design notes: this panel lives inside a code editor, so a dark workspace
 * base is the functionally correct choice (matches how people actually read
 * code for hours), not a generic dark-mode default. The one deliberate
 * accent — a warm gold, not the more common neon-green/vermilion pairing —
 * is spent on exactly one thing: the Socratic question, which is
 * CodeForge Coach's actual differentiator from a generic chatbot. The
 * five-segment depth indicator is real information (how far progressive
 * coaching has gone), not decoration. Swap the --coach-* tokens below for
 * CodeForge's real design system; this file assumes none exists.
 */
import { type ReactNode } from "react";

export type CoachMode = "EXPLAIN" | "HINT" | "ASK_QUESTION" | "DEEP_EXPLANATION";

export interface CoachCodeLocation {
  file?: string;
  line?: number;
  function?: string;
}

export interface CoachResponseView {
  responseType: string;
  observation: string;
  concept?: string;
  codeLocations: CoachCodeLocation[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  coachingLevel: number; // 1-5
  nextQuestion?: string;
}

interface CoachPanelProps {
  latest?: CoachResponseView;
  loading?: boolean;
  unavailable?: boolean;
  onRequestMode: (mode: CoachMode) => void;
  onNavigate?: (location: CoachCodeLocation) => void;
}

const MODE_LABEL: Record<CoachMode, string> = {
  EXPLAIN: "Explain",
  HINT: "Give me a hint",
  ASK_QUESTION: "Ask me a question",
  DEEP_EXPLANATION: "Go deeper",
};

export default function CoachPanel({ latest, loading, unavailable, onRequestMode, onNavigate }: CoachPanelProps): ReactNode {
  return (
    <div className="coach-panel">
      <style>{`
        .coach-panel {
          --coach-bg: #111318;
          --coach-surface: #1a1d24;
          --coach-border: #262a33;
          --coach-text: #e7e9ee;
          --coach-text-muted: #8b909c;
          --coach-accent: #e3a857;
          --coach-unavailable: #a67a6c;
          display: flex; flex-direction: column; height: 100%;
          background: var(--coach-bg); color: var(--coach-text);
          border-left: 1px solid var(--coach-border);
          font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
        }
        .coach-panel__header {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px; border-bottom: 1px solid var(--coach-border);
          font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--coach-text-muted);
        }
        .coach-panel__dot { width: 6px; height: 6px; border-radius: 999px; background: var(--coach-accent); flex-shrink: 0; }
        .coach-panel__depth { display: flex; gap: 3px; margin-left: auto; }
        .coach-panel__depth span { width: 10px; height: 3px; border-radius: 2px; background: var(--coach-border); }
        .coach-panel__depth span.filled { background: var(--coach-accent); }
        .coach-panel__body { flex: 1; overflow-y: auto; padding: 16px; }
        .coach-panel__observation { font-size: 14px; line-height: 1.6; margin: 0 0 14px; }
        .coach-panel__locations { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .coach-panel__loc-btn {
          font-size: 11px; font-family: ui-monospace, "SF Mono", monospace;
          padding: 4px 8px; border-radius: 5px; border: 1px solid var(--coach-border);
          background: var(--coach-surface); color: var(--coach-text-muted); cursor: pointer;
        }
        .coach-panel__loc-btn:hover { border-color: var(--coach-accent); color: var(--coach-text); }
        .coach-panel__question {
          font-family: ui-serif, Georgia, "Iowan Old Style", serif; font-style: italic; font-size: 15px;
          line-height: 1.5; padding-left: 14px; border-left: 2px solid var(--coach-accent);
        }
        .coach-panel__question-label {
          display: block; font-family: ui-sans-serif, sans-serif; font-style: normal;
          font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--coach-accent); margin-bottom: 4px;
        }
        .coach-panel__meta { margin-top: 16px; font-size: 11px; color: var(--coach-text-muted); }
        .coach-panel__empty, .coach-panel__loading, .coach-panel__unavailable { font-size: 13px; color: var(--coach-text-muted); line-height: 1.6; }
        .coach-panel__unavailable { color: var(--coach-unavailable); }
        .coach-panel__actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--coach-border); }
        .coach-panel__action-btn {
          font-size: 12px; padding: 7px 12px; border-radius: 6px;
          border: 1px solid var(--coach-border); background: var(--coach-surface);
          color: var(--coach-text); cursor: pointer;
        }
        .coach-panel__action-btn:hover:not(:disabled) { border-color: var(--coach-accent); }
        .coach-panel__action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <div className="coach-panel__header">
        <span className="coach-panel__dot" />
        CodeForge Coach
        {latest && (
          <div className="coach-panel__depth" aria-label={`coaching depth ${latest.coachingLevel} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= latest.coachingLevel ? "filled" : ""} />
            ))}
          </div>
        )}
      </div>

      <div className="coach-panel__body">
        {unavailable && (
          <p className="coach-panel__unavailable">
            AI coaching is offline right now. Your code, submission, and results aren&rsquo;t affected — try again shortly.
          </p>
        )}

        {!unavailable && loading && <p className="coach-panel__loading">Reviewing your latest submission…</p>}

        {!unavailable && !loading && latest && (
          <>
            <p className="coach-panel__observation">{latest.observation}</p>

            {latest.codeLocations.length > 0 && (
              <div className="coach-panel__locations">
                {latest.codeLocations.map((loc, i) => (
                  <button key={i} className="coach-panel__loc-btn" onClick={() => onNavigate?.(loc)}>
                    {loc.function ?? (loc.line ? `line ${loc.line}` : "view code")}
                  </button>
                ))}
              </div>
            )}

            {latest.nextQuestion && (
              <div className="coach-panel__question">
                <span className="coach-panel__question-label">Consider</span>
                {latest.nextQuestion}
              </div>
            )}

            <div className="coach-panel__meta">confidence: {latest.confidence.toLowerCase()}</div>
          </>
        )}

        {!unavailable && !loading && !latest && <p className="coach-panel__empty">Submit your code and I&rsquo;ll help you work through the result.</p>}
      </div>

      <div className="coach-panel__actions">
        {(["EXPLAIN", "HINT", "ASK_QUESTION"] as CoachMode[]).map((mode) => (
          <button key={mode} className="coach-panel__action-btn" disabled={unavailable} onClick={() => onRequestMode(mode)}>
            {MODE_LABEL[mode]}
          </button>
        ))}
      </div>
    </div>
  );
}
