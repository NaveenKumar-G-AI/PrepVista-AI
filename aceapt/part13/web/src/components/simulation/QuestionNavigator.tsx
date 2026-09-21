export type QState = "current" | "answered" | "skipped" | "unvisited";

export function QuestionNavigator({
  count,
  states,
  currentIndex,
  onJump,
}: {
  count: number;
  states: QState[];
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  const styleFor = (state: QState, isCurrent: boolean) => {
    if (isCurrent) return "border-signal-ready bg-signal-ready/15 text-signal-ready ring-1 ring-signal-ready/40";
    if (state === "answered") return "border-signal-ready/40 bg-signal-ready/10 text-signal-ready";
    if (state === "skipped") return "border-signal-developing/40 bg-signal-developing/10 text-signal-developing";
    return "border-ink-600 text-paper-500 hover:border-ink-500";
  };

  return (
    <div className="grid grid-cols-6 gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onJump(i)}
          className={`data-figure text-xs h-8 rounded-md border transition-colors ${styleFor(states[i]!, i === currentIndex)}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
