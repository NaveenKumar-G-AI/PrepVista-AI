import { useState } from "react";
import type { Recommendation } from "../types";
import { ConfidenceBadge, PriorityTag } from "./common";

interface PriorityActionsProps {
  doFirst: Recommendation[];
  doNext: Recommendation[];
  optional: Recommendation[];
  busyId: string | null;
  onComplete: (id: string, resultScore?: number) => void;
  onSkip: (id: string) => void;
}

export function PriorityActions({ doFirst, doNext, optional, busyId, onComplete, onSkip }: PriorityActionsProps) {
  const allEmpty = doFirst.length === 0 && doNext.length === 0 && optional.length === 0;

  if (allEmpty) {
    return (
      <section className="rounded-card border border-line bg-surface p-6 text-center">
        <h2 className="font-display text-base font-semibold">Every measured capability is on track</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Nothing needs attention right now based on current evidence. Log a new assessment result any time to keep
          this current.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="actions-heading" className="space-y-6">
      <h2 id="actions-heading" className="sr-only">
        Recommended actions
      </h2>
      <RecommendationGroup title="Do first" recs={doFirst} busyId={busyId} onComplete={onComplete} onSkip={onSkip} />
      <RecommendationGroup title="Do next" recs={doNext} busyId={busyId} onComplete={onComplete} onSkip={onSkip} />
      <RecommendationGroup
        title="Optional"
        recs={optional}
        busyId={busyId}
        onComplete={onComplete}
        onSkip={onSkip}
        collapsedByDefault
      />
    </section>
  );
}

function RecommendationGroup({
  title,
  recs,
  busyId,
  onComplete,
  onSkip,
  collapsedByDefault,
}: {
  title: string;
  recs: Recommendation[];
  busyId: string | null;
  onComplete: (id: string, resultScore?: number) => void;
  onSkip: (id: string) => void;
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (recs.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {title} <span className="tabular text-ink-faint">({recs.length})</span>
        </h3>
        <span className="text-xs text-ink-faint" aria-hidden="true">
          {open ? "Hide ⌃" : "Show ⌄"}
        </span>
      </button>
      {open && (
        <ul className="mt-3 space-y-3">
          {recs.map((rec) => (
            <li key={rec.id}>
              <RecommendationCard
                rec={rec}
                busy={busyId === rec.id}
                onComplete={(score) => onComplete(rec.id, score)}
                onSkip={() => onSkip(rec.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  busy,
  onComplete,
  onSkip,
}: {
  rec: Recommendation;
  busy: boolean;
  onComplete: (resultScore?: number) => void;
  onSkip: () => void;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showScoreInput, setShowScoreInput] = useState(false);
  const [scoreDraft, setScoreDraft] = useState("");

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityTag priority={rec.priority} />
        <ConfidenceBadge confidence={rec.confidence} />
      </div>

      <h4 className="mt-2 font-display text-sm font-semibold">
        {rec.actionLabel} · {rec.capabilityName}
      </h4>
      <p className="mt-1 text-sm text-ink-muted">{rec.explanation}</p>

      {rec.lastActionEvent && (
        <p className="mt-2 text-xs text-ink-faint">
          {rec.lastActionEvent.type === "ACTION_COMPLETED" ? "Marked done" : "Skipped"} on{" "}
          {new Date(rec.lastActionEvent.at).toLocaleDateString()}. Log a new result to update this.
        </p>
      )}

      <div className="mt-3">
        <button
          onClick={() => setShowEvidence((v) => !v)}
          className="text-xs font-medium text-accent underline decoration-accent/40 underline-offset-2"
          aria-expanded={showEvidence}
        >
          {showEvidence ? "Hide evidence" : "Why this recommendation? ⌄"}
        </button>
        {showEvidence && (
          <ul className="mt-2 space-y-1 rounded-card bg-paper p-3 text-xs text-ink-muted">
            {rec.evidence.length === 0 ? (
              <li>No recorded attempts yet — that absence is the evidence here.</li>
            ) : (
              rec.evidence.map((e) => (
                <li key={e.attemptId} className="tabular">
                  {new Date(e.takenAt).toLocaleDateString()} — scored {e.score}/100 ({e.source.replace(/_/g, " ")})
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => onComplete(undefined)}
          className="rounded-card bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          Mark as done
        </button>
        <button
          disabled={busy}
          onClick={() => setShowScoreInput((v) => !v)}
          className="rounded-card border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Log a result score
        </button>
        <button
          disabled={busy}
          onClick={onSkip}
          className="rounded-card px-3 py-1.5 text-xs font-medium text-ink-faint hover:text-ink-muted disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      {showScoreInput && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const score = Number(scoreDraft);
            if (Number.isFinite(score) && score >= 0 && score <= 100) {
              onComplete(score);
              setShowScoreInput(false);
              setScoreDraft("");
            }
          }}
        >
          <label htmlFor={`score-${rec.id}`} className="sr-only">
            Result score out of 100
          </label>
          <input
            id={`score-${rec.id}`}
            type="number"
            min={0}
            max={100}
            required
            value={scoreDraft}
            onChange={(e) => setScoreDraft(e.target.value)}
            placeholder="Score /100"
            className="w-28 rounded-card border border-line px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-card bg-ink px-3 py-1.5 text-xs font-semibold text-paper hover:bg-ink/90 disabled:opacity-50"
          >
            Save &amp; mark done
          </button>
        </form>
      )}
    </div>
  );
}
