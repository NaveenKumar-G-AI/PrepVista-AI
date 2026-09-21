import type { HistoryEvent } from "../api/client";

export function HistoryTimeline({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-faint">No mastery events recorded yet for this skill.</p>;
  }
  return (
    <ol className="relative border-l border-line pl-5 space-y-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full bg-ink border-2 border-paper" />
          <p className="text-xs text-ink-faint font-mono tabular">
            {new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <p className="text-sm text-ink mt-0.5">{event.description}</p>
        </li>
      ))}
    </ol>
  );
}
