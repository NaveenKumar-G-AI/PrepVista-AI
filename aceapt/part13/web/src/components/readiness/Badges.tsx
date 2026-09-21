import { confidenceColor, stateColor, STATE_LABELS } from "../../lib/format";
import type { ConfidenceLevel, ReadinessState } from "../../lib/types";

export function StateBadge({ state }: { state: ReadinessState }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${stateColor(state)}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${stateColor(state).replace("text-", "bg-")}`} />
      {STATE_LABELS[state]}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`label-caps ${confidenceColor(level)}`}>Confidence: {level}</span>;
}
