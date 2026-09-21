import type { NextBestActionEntry, Strength, Weakness } from "../../types/report";

export function StrengthsWeaknessesActionsSection({
  strengths,
  weaknesses,
  recommendations,
}: {
  strengths: Strength[];
  weaknesses: Weakness[];
  recommendations: NextBestActionEntry[];
}) {
  return (
    <>
      <section aria-labelledby="sw-heading" className="mb-11 grid gap-8 sm:grid-cols-2">
        <div>
          <h2
            id="sw-heading"
            className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-2 border-b border-[color:var(--report-border)]"
          >
            Strengths
          </h2>
          {strengths.length === 0 ? (
            <p className="text-sm italic text-[color:var(--report-text-muted)] pt-2">
              No skill currently meets the evidence threshold to be listed as a strength.
            </p>
          ) : (
            <ul>
              {strengths.map((s) => (
                <li key={s.title} className="py-3 border-b border-[color:var(--report-border)] last:border-0">
                  <div className="font-medium text-[color:var(--report-text)]">{s.title}</div>
                  <div className="text-xs text-[color:var(--report-text-muted)] mt-0.5">{s.evidenceRefs.join(" · ")}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-2 border-b border-[color:var(--report-border)]">
            Weaknesses &amp; Next Steps
          </h2>
          {weaknesses.length === 0 ? (
            <p className="text-sm italic text-[color:var(--report-text-muted)] pt-2">No notable gaps currently on record.</p>
          ) : (
            <ul>
              {weaknesses.map((w) => (
                <li key={w.title} className="py-3 border-b border-[color:var(--report-border)] last:border-0">
                  <div className="font-medium text-[color:var(--report-text)]">{w.title}</div>
                  <div className="text-xs text-[color:var(--report-text-muted)] mt-0.5">{w.impact}</div>
                  <div className="text-xs text-[color:var(--report-positive)] mt-1">→ {w.recommendedAction}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="actions-heading" className="mb-4">
        <h2
          id="actions-heading"
          className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-2 border-b border-[color:var(--report-border)]"
        >
          Next Best Actions
        </h2>
        {recommendations.length === 0 ? (
          <p className="text-sm italic text-[color:var(--report-text-muted)] pt-2">Nothing queued right now.</p>
        ) : (
          <ol>
            {recommendations.map((a, i) => (
              <li key={i} className="flex gap-3 py-3 border-b border-[color:var(--report-border)] last:border-0">
                <span className="h-fit shrink-0 rounded-md border border-[color:var(--report-border)] px-1.5 py-0.5 font-[family-name:var(--report-font-mono)] text-[11px] text-[color:var(--report-accent)]">
                  P{a.priority}
                </span>
                <div>
                  <div className="font-medium text-[14px]">{a.action}</div>
                  <div className="text-xs text-[color:var(--report-text-muted)] mt-0.5">{a.why}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
