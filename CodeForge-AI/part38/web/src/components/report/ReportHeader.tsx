import type { ReportFreshnessStatus, TechnicalMasteryReportDto } from "../../types/report";

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

const FRESHNESS_COPY: Record<ReportFreshnessStatus, { label: string; tone: "positive" | "muted" | "alert" }> = {
  UP_TO_DATE: { label: "Up to date", tone: "positive" },
  STALE: { label: "Stale — newer data is available", tone: "alert" },
  GENERATING: { label: "Generating…", tone: "muted" },
  FAILED: { label: "Generation failed", tone: "alert" },
  UNAVAILABLE: { label: "Unavailable", tone: "muted" },
};

const toneClass: Record<"positive" | "muted" | "alert", string> = {
  positive: "text-[color:var(--report-positive)]",
  muted: "text-[color:var(--report-text-muted)]",
  alert: "text-[color:var(--report-alert)]",
};

export interface ReportHeaderProps {
  dto: TechnicalMasteryReportDto;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function ReportHeader({ dto, onRefresh, refreshing }: ReportHeaderProps) {
  const freshness = FRESHNESS_COPY[dto.freshness];

  return (
    <header className="border-b border-[color:var(--report-border)] pb-6 mb-8">
      <p className="font-[family-name:var(--report-font-mono)] text-[11px] tracking-[0.08em] uppercase text-[color:var(--report-accent)] mb-1">
        Technical Mastery Report
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--report-font-display)] text-[28px] font-semibold text-[color:var(--report-text)] leading-tight">
            {dto.identity.studentName}
          </h1>
          <p className="text-sm text-[color:var(--report-text-muted)] mt-1">{dto.organization.orgName}</p>
        </div>

        <div className="flex items-center gap-3">
          <span
            role="status"
            aria-label={`Report status: ${freshness.label}`}
            className={`inline-flex items-center gap-2 rounded-md border border-[color:var(--report-border)] bg-[color:var(--report-surface)] px-3 py-1.5 text-xs ${toneClass[freshness.tone]}`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${freshness.tone === "positive" ? "bg-[color:var(--report-positive)]" : freshness.tone === "alert" ? "bg-[color:var(--report-alert)]" : "bg-[color:var(--report-text-muted)]"}`}
            />
            {freshness.label}
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-md border border-[color:var(--report-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--report-text)] hover:border-[color:var(--report-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--report-accent)] disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-[family-name:var(--report-font-mono)] text-[11px] text-[color:var(--report-text-muted)]">
        <div className="flex gap-1">
          <dt>Schema</dt>
          <dd>v{dto.metadata.schemaVersion}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Source data</dt>
          <dd>v{dto.metadata.sourceDataVersion}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Generated</dt>
          <dd>{new Date(dto.metadata.generatedAt).toLocaleString()}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Narrative</dt>
          <dd>{titleCase(dto.narrative.source)}</dd>
        </div>
      </dl>
    </header>
  );
}
