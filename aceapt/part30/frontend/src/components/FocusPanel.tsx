import { useState } from "react";
import type { Bottleneck, NextBestAction, PathMilestone } from "../types";

const DIMENSION_LABEL: Record<string, string> = {
  accuracy: "Accuracy",
  speed: "Speed",
  transfer: "Transfer",
  consistency: "Consistency",
};

function EvidenceBar({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs font-body">
      <span className={`w-20 shrink-0 ${dim ? "text-route" : "text-ink-3"}`}>{label}</span>
      <div className="h-1 flex-1 rounded-full bg-base-border overflow-hidden">
        <div className={`h-full ${dim ? "bg-route" : "bg-ink-3"}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className={`w-8 text-right font-mono ${dim ? "text-route" : "text-ink-2"}`}>{value.toFixed(0)}</span>
    </div>
  );
}

export function FocusPanel({
  bottleneck,
  nextBestAction,
  milestones,
  onComplete,
  onSkip,
  onProve,
  busy,
}: {
  bottleneck: Bottleneck | null;
  nextBestAction: NextBestAction | null;
  milestones: PathMilestone[];
  onComplete: (actionId: string, result: Record<string, unknown>) => Promise<void>;
  onSkip: (actionId: string) => Promise<void>;
  onProve: (milestoneId: string) => Promise<void>;
  busy: boolean;
}) {
  const [attempting, setAttempting] = useState(false);
  const [correct, setCorrect] = useState(8);
  const [total, setTotal] = useState(10);
  const [timeTaken, setTimeTaken] = useState(900);
  const [timeAllowed, setTimeAllowed] = useState(1000);

  const linkedMilestone = nextBestAction?.action.milestoneId ? milestones.find((m) => m.id === nextBestAction.action.milestoneId) : undefined;
  const skippable = linkedMilestone ? !linkedMilestone.critical : true;

  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      {bottleneck && (
        <div className="mb-5 pb-5 border-b border-base-border">
          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-1.5">Current bottleneck</div>
          <div className="font-display text-2xl text-ink-1 italic">{bottleneck.capabilityName}</div>
          <p className="mt-2 text-sm text-ink-2 font-body leading-relaxed">{bottleneck.explanation}</p>
          <div className="mt-4 flex flex-col gap-1.5 max-w-sm">
            {(["accuracy", "speed", "transfer", "consistency"] as const).map((d) => (
              <EvidenceBar key={d} label={DIMENSION_LABEL[d]} value={bottleneck.evidence[d]} dim={d === bottleneck.dimension} />
            ))}
          </div>
        </div>
      )}

      {nextBestAction ? (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-1.5">Your next best action</div>
          <div className="font-display text-2xl text-ink-1 italic">{nextBestAction.headline}</div>
          <p className="mt-2 text-sm text-ink-2 font-body leading-relaxed">{nextBestAction.why}</p>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {nextBestAction.action.type === "PROVE" && nextBestAction.action.milestoneId ? (
              <button
                disabled={busy}
                onClick={() => onProve(nextBestAction.action.milestoneId!)}
                className="rounded-md bg-route text-base-bg font-body text-sm font-medium px-4 py-2 hover:bg-route-soft transition-colors disabled:opacity-50"
              >
                Prove milestone
              </button>
            ) : !attempting ? (
              <button
                disabled={busy}
                onClick={() => setAttempting(true)}
                className="rounded-md bg-route text-base-bg font-body text-sm font-medium px-4 py-2 hover:bg-route-soft transition-colors disabled:opacity-50"
              >
                Continue path
              </button>
            ) : null}

            {nextBestAction.action.milestoneId && skippable && !attempting && (
              <button disabled={busy} onClick={() => onSkip(nextBestAction.action.id)} className="text-sm text-ink-3 hover:text-ink-2 font-body transition-colors">
                Skip this step
              </button>
            )}
          </div>

          {attempting && (
            <div className="mt-4 rounded-md border border-base-border bg-base-surface2 p-4">
              <p className="text-xs text-ink-3 font-body mb-3">
                This reference build has no real ADAPT session to launch -- enter a result to simulate completing this action and see the path recalculate live.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm font-body">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-3">Correct</span>
                  <input type="number" value={correct} min={0} onChange={(e) => setCorrect(Number(e.target.value))} className="bg-base-surface border border-base-border rounded px-2 py-1 text-ink-1 font-mono" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-3">Total</span>
                  <input type="number" value={total} min={1} onChange={(e) => setTotal(Number(e.target.value))} className="bg-base-surface border border-base-border rounded px-2 py-1 text-ink-1 font-mono" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-3">Time taken (s)</span>
                  <input type="number" value={timeTaken} min={1} onChange={(e) => setTimeTaken(Number(e.target.value))} className="bg-base-surface border border-base-border rounded px-2 py-1 text-ink-1 font-mono" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-3">Time allowed (s)</span>
                  <input type="number" value={timeAllowed} min={1} onChange={(e) => setTimeAllowed(Number(e.target.value))} className="bg-base-surface border border-base-border rounded px-2 py-1 text-ink-1 font-mono" />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy}
                  onClick={async () => {
                    await onComplete(nextBestAction.action.id, {
                      correct,
                      total,
                      timeTakenSeconds: timeTaken,
                      timeAllowedSeconds: timeAllowed,
                      passed: correct / total >= 0.7 && timeTaken <= timeAllowed,
                      contextNovelty: nextBestAction.action.type === "TRANSFER" ? "NOVEL" : "SEEN",
                    });
                    setAttempting(false);
                  }}
                  className="rounded-md bg-route text-base-bg font-body text-sm font-medium px-4 py-2 hover:bg-route-soft transition-colors disabled:opacity-50"
                >
                  Submit result
                </button>
                <button onClick={() => setAttempting(false)} className="text-sm text-ink-3 hover:text-ink-2 font-body px-2">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-2 font-body">No open action right now -- your current evidence already meets what's required.</p>
      )}
    </div>
  );
}
