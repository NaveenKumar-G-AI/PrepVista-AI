import type { MetricService } from "./metricService.js";
import type { ReportingService, DepartmentRow, CompanyRow, FunnelConversionDelta } from "./reportingService.js";
import type { DataQualityService } from "./dataQualityService.js";
import type { EvidenceService } from "./evidenceService.js";
import type { ReportDefinitionRepository } from "../repositories/reportDefinitionRepository.js";
import type { ReportSnapshotRepository, ReportSnapshot } from "../repositories/reportSnapshotRepository.js";
import type { ManagementTargetRepository } from "../repositories/managementTargetRepository.js";
import type {
  ApplicationRepository,
  OfferRepository,
  StudentRepository,
} from "../repositories/sourceRepositories.js";
import type { FunnelStage, MetricValue, ReportWarning } from "../types.js";

export interface ExecutiveReportPayload {
  institutionId: string;
  season: string;
  dataThrough: string;
  kpis: {
    placementRate: MetricValue;
    target: number | null;
    gapPoints: number | null;
    offersCount: number;
    acceptedCount: number;
    joinedCount: number;
    verifiedPlacementCount: number;
    medianCtc: MetricValue;
    averageCtc: MetricValue;
    highestCtc: MetricValue;
    companiesCount: number;
    repeatRecruitersCount: number;
    avgReadiness: number | null;
    highRiskCount: number;
  };
  funnel: FunnelStage[];
  funnelComparison: FunnelConversionDelta[] | null;
  comparisonSeason: string | null;
  departmentPerformance: DepartmentRow[];
  companyReport: CompanyRow[];
  insights: string[];
}

export class ReportGenerationService {
  constructor(
    private students: StudentRepository,
    private applications: ApplicationRepository,
    private offers: OfferRepository,
    private metrics: MetricService,
    private reporting: ReportingService,
    private dataQuality: DataQualityService,
    private evidenceService: EvidenceService,
    private reportDefinitions: ReportDefinitionRepository,
    private snapshots: ReportSnapshotRepository,
    private targets: ManagementTargetRepository
  ) {}

  buildExecutiveReportPayload(
    institutionId: string,
    season: string,
    comparisonSeason?: string
  ): ExecutiveReportPayload {
    const placementRate = this.metrics.compute(institutionId, "placement_rate", season);
    const medianCtc = this.metrics.compute(institutionId, "median_ctc", season);
    const averageCtc = this.metrics.compute(institutionId, "average_ctc", season);
    const highestCtc = this.metrics.compute(institutionId, "highest_ctc", season);

    const funnel = this.reporting.getExecutiveFunnel(institutionId, season);
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

    const funnelComparison = comparisonSeason
      ? this.reporting.compareFunnels(institutionId, season, comparisonSeason)
      : null;

    const departmentPerformance = this.reporting.getDepartmentPerformance(institutionId, season);
    const companyReport = this.reporting.getCompanyReport(institutionId, season, comparisonSeason);

    const students = this.students.findAll({ institutionId, season });
    const readinessScores = students
      .map((s) => s.readinessScore)
      .filter((v): v is number => v !== null && v !== undefined);
    const avgReadiness = readinessScores.length
      ? round1(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
      : null;
    const highRiskCount = students.filter((s) => s.riskLevel === "high_risk").length;

    const target = this.targets.get(institutionId, season, "placement_rate");
    const gapPoints = target !== null ? round1(placementRate.value - target) : null;

    const dataThrough = this.computeDataThrough(institutionId, season);

    const insights = buildInsights(funnelComparison, departmentPerformance, funnel);

    return {
      institutionId,
      season,
      dataThrough,
      kpis: {
        placementRate,
        target,
        gapPoints,
        offersCount: byStage.offer ?? 0,
        acceptedCount: byStage.accepted ?? 0,
        joinedCount: byStage.joined ?? 0,
        verifiedPlacementCount: byStage.verified_placement ?? 0,
        medianCtc,
        averageCtc,
        highestCtc,
        companiesCount: companyReport.length,
        repeatRecruitersCount: companyReport.filter((c) => c.isRepeatRecruiter).length,
        avgReadiness,
        highRiskCount,
      },
      funnel,
      funnelComparison,
      comparisonSeason: comparisonSeason ?? null,
      departmentPerformance,
      companyReport,
      insights,
    };
  }

  /** Section 27/44: generates the payload, then FREEZES it as an immutable snapshot. */
  publishExecutiveReport(
    institutionId: string,
    season: string,
    generatedBy: string,
    comparisonSeason?: string
  ): { snapshot: ReportSnapshot; payload: ExecutiveReportPayload } {
    const payload = this.buildExecutiveReportPayload(institutionId, season, comparisonSeason);
    const definition = this.reportDefinitions.getLatest(institutionId, "executive_report");

    const { warnings, integrityIssues } = this.dataQuality.getWarningsAndIssues(institutionId, season);
    const allWarnings: ReportWarning[] = [...warnings, ...integrityIssues];
    const quality = this.dataQuality.computeQualityScore(institutionId, season);

    // Attach durable evidence for the headline metrics at the moment of publication.
    this.evidenceService.recordMetricEvidence(
      institutionId,
      payload.kpis.placementRate,
      `placement_rate:${institutionId}:${season}`
    );
    this.evidenceService.recordMetricEvidence(
      institutionId,
      payload.kpis.medianCtc,
      `median_ctc:${institutionId}:${season}`
    );

    const snapshot = this.snapshots.create({
      institutionId,
      reportDefinitionId: definition.id,
      reportDefinitionVersion: definition.version,
      season,
      filters: comparisonSeason ? { comparisonSeason } : {},
      metricDefinitionVersions: {
        placement_rate: payload.kpis.placementRate.definitionVersion,
        median_ctc: payload.kpis.medianCtc.definitionVersion,
        average_ctc: payload.kpis.averageCtc.definitionVersion,
        highest_ctc: payload.kpis.highestCtc.definitionVersion,
      },
      dataThrough: payload.dataThrough,
      payload,
      warnings: allWarnings,
      qualityScore: quality.score,
      generatedBy,
    });

    return { snapshot, payload };
  }

  private computeDataThrough(institutionId: string, season: string): string {
    const offers = this.offers.findAll({ institutionId, season });
    const applications = this.applications.findAll({ institutionId, season });
    const timestamps = [
      ...offers.map((o) => o.createdAt),
      ...applications.map((a) => a.appliedAt),
    ].filter(Boolean);
    if (timestamps.length === 0) return new Date().toISOString();
    return timestamps.sort().at(-1)!;
  }
}

function buildInsights(
  funnelComparison: FunnelConversionDelta[] | null,
  departments: DepartmentRow[],
  funnel: FunnelStage[]
): string[] {
  const insights: string[] = [];

  if (funnelComparison && funnelComparison.length > 0) {
    const worst = funnelComparison[0];
    if (worst.deltaPoints !== null && worst.deltaPoints < 0) {
      insights.push(
        `${capitalize(worst.fromStage)} → ${worst.toStage} conversion is down ` +
          `${Math.abs(worst.deltaPoints)} points versus last season ` +
          `(${worst.comparisonPct}% → ${worst.currentPct}%).`
      );
    }
  }

  if (departments.length > 1) {
    const sorted = [...departments].sort((a, b) => a.placementRatePct - b.placementRatePct);
    const rates = sorted.map((d) => d.placementRatePct).sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
    const worstDept = sorted[0];
    if (worstDept.placementRatePct < median - 1) {
      insights.push(
        `${worstDept.department} placement (${worstDept.placementRatePct}%) is ` +
          `${round1(median - worstDept.placementRatePct)} points below the institutional median.`
      );
    }
  }

  const acceptedCount = funnel.find((f) => f.stage === "accepted")?.count ?? 0;
  const joinedCount = funnel.find((f) => f.stage === "joined")?.count ?? 0;
  const gap = acceptedCount - joinedCount;
  if (gap > 0) {
    insights.push(`${gap} student(s) have accepted an offer but have not confirmed joining.`);
  }

  return insights;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
