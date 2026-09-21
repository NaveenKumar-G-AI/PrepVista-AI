import type { CapabilityGap } from "../types";
import { ConfidenceBadge, TrendIndicator } from "./common";

/**
 * The one bold visual idea in this UI (see docs/design notes in README):
 * a quiet instrument-style bar per capability — a filled track for the
 * measured score, a tick for the role's target bar, tick marks every 10
 * points. Answers "where's my biggest gap" and "am I improving" at a
 * glance, per spec section 27 (only chart what answers a real question).
 */
export function CapabilityGapsOverview({ gaps }: { gaps: CapabilityGap[] }) {
  return (
    <section aria-labelledby="gaps-heading" className="rounded-card border border-line bg-surface p-5">
      <h2 id="gaps-heading" className="font-display text-base font-semibold">
        Capability gaps
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Filled bar is your most recent score. The tick is the benchmark for your target role.
      </p>

      <ul className="mt-5 space-y-5">
        {gaps.map((gap) => (
          <li key={gap.capabilityId}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{gap.capabilityName}</span>
              <span className="tabular text-xs text-ink-muted">
                {gap.currentScore === null ? "No data yet" : `${gap.currentScore} / ${gap.targetBar}`}
              </span>
            </div>

            <div
              className="relative mt-2 h-2.5 rounded-full bg-line/70"
              role="img"
              aria-label={
                gap.currentScore === null
                  ? `${gap.capabilityName}: not yet assessed. Target is ${gap.targetBar} out of 100.`
                  : `${gap.capabilityName}: scored ${gap.currentScore} out of 100. Target is ${gap.targetBar}.`
              }
            >
              {/* gauge tick marks every 10 points */}
              <div className="absolute inset-0 flex justify-between px-px">
                {Array.from({ length: 11 }).map((_, i) => (
                  <span key={i} className="h-full w-px bg-paper/70" aria-hidden="true" />
                ))}
              </div>

              {gap.currentScore !== null ? (
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${gap.onTrack ? "bg-accent" : "bg-ink/70"}`}
                  style={{ width: `${gap.currentScore}%` }}
                  aria-hidden="true"
                />
              ) : (
                <div
                  className="absolute inset-y-0 left-0 w-full rounded-full border border-dashed border-ink-faint/60"
                  aria-hidden="true"
                />
              )}

              <div
                className="absolute inset-y-0 w-0.5 bg-ochre"
                style={{ left: `${gap.targetBar}%` }}
                aria-hidden="true"
                title={`Target: ${gap.targetBar}`}
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <TrendIndicator trend={gap.trend} />
              <span className="text-ink-faint" aria-hidden="true">
                ·
              </span>
              <ConfidenceBadge confidence={gap.confidence} />
              {gap.onTrack && (
                <span className="text-xs font-medium text-accent">Meeting the benchmark</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
