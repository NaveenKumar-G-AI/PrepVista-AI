import type { AdaptationEvent } from "../types";

// Internal pipeline events (candidate generation, prioritization passes)
// are real and logged, but showing every one of them to a student would be
// dashboard noise, not insight (section 43). This is the curated subset
// worth surfacing in the visible history.
const VISIBLE_TYPES = new Set([
  "NEXT_ACTION_SELECTED",
  "ACTION_STARTED",
  "ACTION_COMPLETED",
  "ACTION_SKIPPED",
  "CAPABILITY_UPDATED",
  "PLAN_RECOMPUTED"
]);

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface AdaptiveHistoryProps {
  events: AdaptationEvent[];
}

export function AdaptiveHistory({ events }: AdaptiveHistoryProps) {
  const visible = events.filter((e) => VISIBLE_TYPES.has(e.type)).slice(0, 20);

  if (visible.length === 0) {
    return <p className="text-sm text-faint">Nothing recorded yet this session.</p>;
  }

  return (
    <ol className="relative ml-1.5 space-y-4 border-l border-line pl-5">
      {visible.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[25px] top-1 h-2 w-2 rounded-full border-2 border-ink-950 bg-signal" />
          <p className="text-sm text-paper">{event.summary}</p>
          <p className="mt-0.5 font-mono text-[11px] text-faint">{timeLabel(event.at)}</p>
        </li>
      ))}
    </ol>
  );
}
