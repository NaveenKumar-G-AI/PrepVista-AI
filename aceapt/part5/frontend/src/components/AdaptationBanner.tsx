import { DIFFICULTY_LABELS, AdaptationEvent } from "../types";

export function AdaptationBanner({ event }: { event: AdaptationEvent }) {
  const direction = event.newDifficulty > event.previousDifficulty ? "up" : event.newDifficulty < event.previousDifficulty ? "down" : "steady";

  return (
    <div className="animate-[slideIn_400ms_ease-out] rounded-lg border border-signal-amber/30 bg-signal-amber/10 p-4">
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-signal-amber">Recalibrated</span>
        <span className="font-mono text-[11px] text-ink-700/60">
          {DIFFICULTY_LABELS[event.previousDifficulty]} {direction === "up" ? "→" : direction === "down" ? "→" : "="} {DIFFICULTY_LABELS[event.newDifficulty]}
          {event.focusDimension ? ` · ${event.focusDimension.toLowerCase()} focus` : ""}
        </span>
      </div>
      <p className="mt-1.5 font-body text-sm leading-snug text-ink-900">{event.message}</p>
    </div>
  );
}
