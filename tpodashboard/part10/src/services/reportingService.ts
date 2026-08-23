import type { MetricService } from "./metricService.js";
import type {
  ApplicationRepository,
  InterviewRepository,
  JoiningRepository,
  OfferRepository,
  StudentRepository,
} from "../repositories/sourceRepositories.js";
import type { Application, FunnelStage, Offer } from "../types.js";

const FUNNEL_STAGE_ORDER = [
  "seeking",
  "eligible",
  "applied",
  "shortlisted",
  "interviewed",
  "selected",
  "offer",
  "accepted",
  "joined",
  "verified_placement",
] as const;

type FurthestStatus = "applied" | "shortlisted" | "interviewed" | "selected" | "offered";
const STATUS_RANK: Record<Application["status"], number> = {
  withdrawn: -1,
  rejected: 0,
  applied: 1,
  shortlisted: 2,
  interviewed: 3,
  selected: 4,
  offered: 5,
};

function furthestStatusByStudent(applications: Application[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const app of applications) {
    const rank = STATUS_RANK[app.status];
    const current = best.get(app.studentId) ?? -Infinity;
    if (rank > current) best.set(app.studentId, rank);
  }
  return best;
}

export interface DepartmentRow {
  department: string;
  students: number;
  seeking: number;
  applications: number;
  interviewed: number;
  offers: number;
  accepted: number;
  joined: number;
  verifiedPlacement: number;
  placementRatePct: number;
  medianCtc: number;
  avgReadiness: number | null;
  highRiskCount: number;
}

export interface CompanyRow {
  company: string;
  drives: number;
  applications: number;
  offersMade: number;
  studentsHired: number;
  medianCtc: number;
  isRepeatRecruiter: boolean;
}

export interface FunnelConversionDelta {
  fromStage: string;
  toStage: string;
  currentPct: number;
  comparisonPct: number | null;
  deltaPoints: number | null;
}

export class ReportingService {
  constructor(
    private students: StudentRepository,
    private applications: ApplicationRepository,
    private interviews: InterviewRepository,
    private offers: OfferRepository,
    private joining: JoiningRepository,
    private metrics: MetricService
  ) {}

  /** Section 11: the ten-stage executive funnel, using only actual records. */
  getExecutiveFunnel(institutionId: string, season: string, department?: string): FunnelStage[] {
    const students = this.students.findAll({ institutionId, season, department });
    const studentIds = new Set(students.map((s) => s.id));
    const applications = this.applications
      .findAll({ institutionId, season, department })
      .filter((a) => studentIds.has(a.studentId));
    const furthest = furthestStatusByStudent(applications);

    const offers = this.offers
      .findAll({ institutionId, season })
      .filter((o) => studentIds.has(o.studentId));

    const counts: Record<(typeof FUNNEL_STAGE_ORDER)[number], number> = {
      seeking: students.filter((s) => s.seekingPlacement).length,
      eligible: students.filter((s) => s.seekingPlacement && s.eligible).length,
      applied: new Set([...furthest.keys()].filter((id) => (furthest.get(id) ?? -Infinity) >= 1)).size,
      shortlisted: new Set([...furthest.keys()].filter((id) => (furthest.get(id) ?? -Infinity) >= 2)).size,
      interviewed: new Set([...furthest.keys()].filter((id) => (furthest.get(id) ?? -Infinity) >= 3)).size,
      selected: new Set([...furthest.keys()].filter((id) => (furthest.get(id) ?? -Infinity) >= 4)).size,
      offer: new Set(offers.map((o) => o.studentId)).size,
      accepted: new Set(offers.filter((o) => o.status === "accepted").map((o) => o.studentId)).size,
      joined: 0,
      verified_placement: 0,
    };

    const joinedIds = new Set<string>();
    const verifiedIds = new Set<string>();
    for (const offer of offers) {
      const j = this.joining.findByOfferId(offer.id);
      if (j && j.status === "joined") {
        joinedIds.add(offer.studentId);
        if (j.verified) verifiedIds.add(offer.studentId);
      }
    }
    counts.joined = joinedIds.size;
    counts.verified_placement = verifiedIds.size;

    return FUNNEL_STAGE_ORDER.map((stage, i) => {
      const prevStage = i > 0 ? FUNNEL_STAGE_ORDER[i - 1] : null;
      const prevCount = prevStage ? counts[prevStage] : null;
      return {
        stage,
        count: counts[stage],
        conversionFromPrevious:
          prevCount === null ? null : prevCount === 0 ? 0 : (counts[stage] / prevCount) * 100,
      };
    });
  }

  /** Section 45/52: compare two seasons' funnels stage-by-stage, sorted by biggest drop — powers "why below target". */
  compareFunnels(
    institutionId: string,
    currentSeason: string,
    comparisonSeason: string,
    department?: string
  ): FunnelConversionDelta[] {
    const current = this.getExecutiveFunnel(institutionId, currentSeason, department);
    const comparison = this.getExecutiveFunnel(institutionId, comparisonSeason, department);

    const deltas: FunnelConversionDelta[] = [];
    for (let i = 1; i < current.length; i++) {
      const curr = current[i];
      const comp = comparison[i];
      if (curr.conversionFromPrevious === null) continue;
      const deltaPoints =
        comp?.conversionFromPrevious != null ? curr.conversionFromPrevious - comp.conversionFromPrevious : null;
      deltas.push({
        fromStage: current[i - 1].stage,
        toStage: curr.stage,
        currentPct: round1(curr.conversionFromPrevious),
        comparisonPct: comp?.conversionFromPrevious != null ? round1(comp.conversionFromPrevious) : null,
        deltaPoints: deltaPoints !== null ? round1(deltaPoints) : null,
      });
    }
    // Largest regressions first (most negative delta = biggest problem)
    return deltas.sort((a, b) => (a.deltaPoints ?? 0) - (b.deltaPoints ?? 0));
  }

  /** Section 13: per-department management report. */
  getDepartmentPerformance(institutionId: string, season: string): DepartmentRow[] {
    const students = this.students.findAll({ institutionId, season });
    const departments = [...new Set(students.map((s) => s.department))].sort();
    return departments.map((department) => {
      const deptStudents = students.filter((s) => s.department === department);
      const funnel = this.getExecutiveFunnel(institutionId, season, department);
      const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));
      const placementRate = this.metrics.compute(institutionId, "placement_rate", season, department);
      const medianCtc = this.metrics.compute(institutionId, "median_ctc", season, department);

      const readinessScores = deptStudents
        .map((s) => s.readinessScore)
        .filter((v): v is number => v !== null && v !== undefined);
      const avgReadiness = readinessScores.length
        ? round1(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
        : null;

      return {
        department,
        students: deptStudents.length,
        seeking: byStage.seeking,
        applications: byStage.applied,
        interviewed: byStage.interviewed,
        offers: byStage.offer,
        accepted: byStage.accepted,
        joined: byStage.joined,
        verifiedPlacement: byStage.verified_placement,
        placementRatePct: round1(placementRate.value),
        medianCtc: medianCtc.value,
        avgReadiness,
        highRiskCount: deptStudents.filter((s) => s.riskLevel === "high_risk").length,
      };
    });
  }

  /** Section 16: company/recruiter report (TPO/management only — enforced at the API layer, not here). */
  getCompanyReport(institutionId: string, season: string, priorSeason?: string): CompanyRow[] {
    const offers = this.offers.findAll({ institutionId, season });
    const applications = this.applications.findAll({ institutionId, season });
    const priorCompanies = priorSeason
      ? new Set(this.offers.findAll({ institutionId, season: priorSeason }).map((o) => o.company))
      : new Set<string>();

    const companies = [...new Set(offers.map((o) => o.company))].sort();
    return companies.map((company) => {
      const companyOffers = offers.filter((o) => o.company === company);
      const companyApps = applications.filter((a) => a.company === company);
      const hired = new Set<string>();
      for (const o of companyOffers) {
        const j = this.joining.findByOfferId(o.id);
        if (j?.status === "joined" && j.verified) hired.add(o.studentId);
      }
      const ctcs = companyOffers
        .filter((o) => hired.has(o.studentId))
        .map((o) => o.ctcFixed + o.ctcVariable)
        .sort((a, b) => a - b);
      const mid = Math.floor(ctcs.length / 2);
      const median = ctcs.length === 0 ? 0 : ctcs.length % 2 ? ctcs[mid] : (ctcs[mid - 1] + ctcs[mid]) / 2;

      return {
        company,
        drives: new Set(companyApps.map((a) => a.driveId)).size,
        applications: companyApps.length,
        offersMade: companyOffers.length,
        studentsHired: hired.size,
        medianCtc: median,
        isRepeatRecruiter: priorCompanies.has(company),
      };
    });
  }

  /** Section 6/21: coarse interview stats — attendance and pending results. */
  getInterviewStats(institutionId: string, season: string) {
    const rows = this.interviews.findAll({ institutionId, season });
    return {
      scheduled: rows.length,
      attended: rows.filter((r) => r.attended === true).length,
      completed: rows.filter((r) => r.completedAt !== null).length,
      pendingResults: rows.filter((r) => r.completedAt !== null && r.result === "pending").length,
    };
  }

  listOffersFor(institutionId: string, offerIds: string[]): Offer[] {
    return offerIds
      .map((id) => this.offers.findById(id, institutionId))
      .filter((o): o is Offer => o !== null);
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
