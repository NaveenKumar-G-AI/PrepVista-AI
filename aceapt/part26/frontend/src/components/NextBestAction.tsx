import { Loader2, SkipForward } from "lucide-react";
import type { NextActionResponse, TopicCapabilityState } from "../types";
import { EvidenceReadout } from "./EvidenceReadout";
import { metricsForBottleneck } from "../lib/bottleneckMetrics";

const EV_STYLES: Record<string, string> = {
  HIGH: "border-priority/60 bg-priority/15 text-priority",
  MEDIUM: "border-signal/50 bg-signal/10 text-signal",
  LOW: "border-line text-muted"
};

interface NextBestActionProps {
  next: NextActionResponse;
  topics: TopicCapabilityState[];
  onStart: () => void;
  onSkip: () => void;
  starting: boolean;
}

export function NextBestAction({ next, topics, onStart, onSkip, starting }: NextBestActionProps) {
  if (!next.action || !next.explanation) {
    return (
      <div className="rounded-2xl border border-line-soft bg-ink-900/60 p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-signal">Your next best action</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-paper">Everything tracked is stable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Mastery, retention, and transfer are all holding up across your tracked topics right now. Pick a time
          budget below for a stretch challenge, or check back after your next practice session.
        </p>
      </div>
    );
  }

  const { action, explanation } = next;
  const state = topics.find((t) => t.topicId === action.topicId);
  const metrics = metricsForBottleneck(action.bottleneck, state);

  return (
    <div className="rounded-2xl border border-line-soft bg-ink-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <p className="font-mono text-[11px] uppercase tracking-widest text-signal">Your next best action</p>
        <span
          className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${EV_STYLES[explanation.expectedValue]}`}
        >
          {explanation.expectedValue} value
        </span>
      </div>

      <h2 className="mt-2 font-display text-2xl font-semibold leading-snug text-paper">{explanation.what}</h2>

      <p className="mt-1 font-mono text-sm text-muted">{explanation.time}</p>

      <div className="mt-4">
        <EvidenceReadout why={explanation.why} metrics={metrics} breakdown={action.priorityBreakdown} />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="flex items-center gap-2 rounded-full bg-priority px-5 py-2.5 text-sm font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {starting && <Loader2 size={15} className="animate-spin" />}
          Start
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={starting}
          className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm text-muted transition-colors hover:text-paper disabled:opacity-60"
        >
          <SkipForward size={14} />
          Skip
        </button>
      </div>
    </div>
  );
}
