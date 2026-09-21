import type { TechnicalMasteryReportDto } from "../../types/report";

function titleCase(value: string | null): string {
  if (!value) return "Not yet available";
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

export function ExecutiveSummaryPanel({ dto }: { dto: TechnicalMasteryReportDto }) {
  const stats: { label: string; value: string }[] = [
    { label: "Overall mastery", value: titleCase(dto.mastery.overallLevel) },
    { label: "Target role", value: dto.summary.targetRole ?? "Not set" },
    { label: "Readiness", value: titleCase(dto.summary.roleReadiness) },
    { label: "Next action", value: dto.summary.nextBestAction ?? "None currently" },
  ];

  return (
    <section aria-labelledby="exec-summary-heading" className="mb-11">
      <h2
        id="exec-summary-heading"
        className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-4 border-b border-[color:var(--report-border)]"
      >
        Executive Summary
      </h2>
      <p className="max-w-[68ch] text-[15.5px] leading-relaxed text-[color:var(--report-text)] mb-4">
        {dto.narrative.executiveSummary}
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-[color:var(--report-border)] bg-[color:var(--report-surface)] p-3.5">
            <dt className="text-[11px] uppercase tracking-[0.06em] text-[color:var(--report-text-muted)] mb-1.5">{s.label}</dt>
            <dd className="font-[family-name:var(--report-font-display)] text-[15px] font-semibold text-[color:var(--report-text)] leading-snug">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
