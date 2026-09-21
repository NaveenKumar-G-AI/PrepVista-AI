import type { Growth } from "../../types/report";

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

export function GrowthTimelineSection({ growth }: { growth: Growth }) {
  return (
    <section aria-labelledby="growth-heading" className="mb-11">
      <h2
        id="growth-heading"
        className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-4 border-b border-[color:var(--report-border)]"
      >
        Technical Growth
      </h2>
      {growth.insufficientData || growth.timeline.length === 0 ? (
        <p className="text-sm italic text-[color:var(--report-text-muted)]">
          Not enough historical data yet to show a growth timeline.
        </p>
      ) : (
        <ol className="space-y-2.5">
          {growth.timeline.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-3 text-[13.5px]">
              <span className="font-[family-name:var(--report-font-mono)] text-[11px] text-[color:var(--report-text-muted)] min-w-[86px]">
                {new Date(e.occurredAt).toLocaleDateString()}
              </span>
              <span>
                {e.skillName}: {titleCase(e.fromLevel)} → {titleCase(e.toLevel)}
              </span>
              {e.note && <span className="text-[12px] text-[color:var(--report-text-muted)]">{e.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
