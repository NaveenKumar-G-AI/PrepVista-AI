import { useCallback, useEffect, useState } from "react";
import type { ReportApiConfig } from "../lib/reportApi";
import { createReportApi } from "../lib/reportApi";
import type { ViewableReport } from "../types/report";
import { ReportHeader } from "../components/report/ReportHeader";
import { ExecutiveSummaryPanel } from "../components/report/ExecutiveSummaryPanel";
import { MasteryAndSkillsSection, RoleReadinessSection } from "../components/report/MasteryAndSkillsSection";
import { EvidenceSection } from "../components/report/EvidenceSection";
import { GrowthTimelineSection } from "../components/report/GrowthTimelineSection";
import { StrengthsWeaknessesActionsSection } from "../components/report/StrengthsWeaknessesActionsSection";

export interface TechnicalMasteryReportPageProps {
  api: ReportApiConfig;
  studentId: string;
}

/**
 * Information hierarchy follows brief §67: identity/state/role first
 * (ReportHeader + ExecutiveSummaryPanel), then strongest/blocking detail,
 * before deep technical sections further down the page.
 */
export function TechnicalMasteryReportPage({ api, studentId }: TechnicalMasteryReportPageProps) {
  const client = createReportApi(api);
  const [report, setReport] = useState<ViewableReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const created = await client.requestReport(studentId);
      setReportId(created.reportId);
    } catch (err) {
      setError((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;

    async function poll() {
      try {
        const result = await client.getReport(reportId!);
        if (cancelled) return;
        setReport(result);
        if (result.status === "GENERATING" || result.status === "QUEUED" || result.status === "REQUESTED" || result.status === "VALIDATING") {
          setTimeout(poll, 1500);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    poll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const handleRefresh = async () => {
    if (!reportId) return;
    setRefreshing(true);
    try {
      const result = await client.refreshReport(reportId);
      setReportId(result.reportId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-xl p-8 text-center text-[color:var(--report-alert)]">
        {error}
      </div>
    );
  }

  if (!report || !report.dto) {
    return (
      <div role="status" aria-live="polite" className="mx-auto max-w-xl p-8 text-center text-[color:var(--report-text-muted)]">
        {report?.status === "FAILED" ? `Report generation failed: ${report.failureReason ?? "unknown error"}` : "Generating report…"}
      </div>
    );
  }

  const { dto } = report;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 bg-[color:var(--report-bg)] text-[color:var(--report-text)] font-[family-name:var(--report-font-body)]">
      <ReportHeader dto={dto} onRefresh={handleRefresh} refreshing={refreshing} />
      <main>
        <ExecutiveSummaryPanel dto={dto} />
        <MasteryAndSkillsSection skills={dto.skills} />
        <RoleReadinessSection roles={dto.roles} gaps={dto.gaps} />
        <EvidenceSection
          coding={dto.evidence.coding}
          debugging={dto.evidence.debugging}
          reasoning={dto.evidence.reasoning}
          projects={dto.evidence.projects}
          interviews={dto.evidence.interviews}
        />
        <GrowthTimelineSection growth={dto.growth} />
        <StrengthsWeaknessesActionsSection
          strengths={dto.strengths}
          weaknesses={dto.weaknesses}
          recommendations={dto.recommendations}
        />
      </main>
    </div>
  );
}
