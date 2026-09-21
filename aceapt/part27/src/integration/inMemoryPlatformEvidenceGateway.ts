import type { CapabilityDimensionKey, ReadinessTarget, SeriesPoint } from "../domain/types.js";
import type { DimensionEvidenceInput } from "../engines/capabilityModel.js";
import type { FailureBoundaryStage } from "../engines/practiceAssessmentGapEngine.js";
import type { EvidenceQualitySummary, PlatformEvidenceGateway } from "./platformEvidenceGateway.js";

interface StudentFixture {
  dimensions: DimensionEvidenceInput[];
  trajectories: Partial<Record<CapabilityDimensionKey | "overall", SeriesPoint[]>>;
  target: ReadinessTarget | null;
  evidenceQuality: EvidenceQualitySummary;
  practiceVsAssessment: { practiceScore: number; assessmentScore: number } | null;
  familiarityVsNovel: { familiarScore: number; novelScore: number } | null;
  failureBoundary: FailureBoundaryStage[] | null;
  selfReportedConfidence: number | null;
}

/**
 * TEST FIXTURE STORE — for local development, unit/integration tests, and
 * `npm run seed:demo` only. This is the file to delete once the real
 * PlatformEvidenceGateway implementation (backed by your actual systems) is
 * ready; nothing else in src/ depends on this class directly, only on the
 * PlatformEvidenceGateway interface.
 */
export class InMemoryPlatformEvidenceGateway implements PlatformEvidenceGateway {
  private students = new Map<string, StudentFixture>();

  /** Seed or replace a student's fixture data. */
  seedStudent(studentId: string, fixture: StudentFixture): void {
    this.students.set(studentId, fixture);
  }

  /** Append a new observation to a dimension/overall series and bump its
   * latest value + observation count — used by scripts/demo.ts to simulate
   * "the student completed an intervention and new evidence came in"
   * (spec section 39: NEW EVIDENCE -> RECALCULATE -> NEW FORECAST). In
   * production this would instead be driven by real ASSESSMENT_COMPLETED
   * events from the assessment/attempt-tracking systems. */
  addObservation(studentId: string, dimension: CapabilityDimensionKey | "overall", point: SeriesPoint): void {
    const fixture = this.students.get(studentId);
    if (!fixture) throw new Error(`No fixture seeded for student ${studentId}`);
    const series = fixture.trajectories[dimension] ?? [];
    fixture.trajectories[dimension] = [...series, point];

    if (dimension !== "overall") {
      const existing = fixture.dimensions.find((d) => d.key === dimension);
      if (existing) {
        existing.latestValue = point.value;
        existing.observationCount += 1;
        existing.lastUpdated = point.date;
      }
    }
    fixture.evidenceQuality = {
      ...fixture.evidenceQuality,
      observationCount: fixture.evidenceQuality.observationCount + 1,
      recencyDaysAvg: Math.max(0, fixture.evidenceQuality.recencyDaysAvg - 1),
    };
  }

  private require(studentId: string): StudentFixture {
    const fixture = this.students.get(studentId);
    if (!fixture) throw new Error(`No fixture seeded for student ${studentId}`);
    return fixture;
  }

  async getCapabilityEvidence(studentId: string): Promise<DimensionEvidenceInput[]> {
    return this.require(studentId).dimensions.map((d) => ({ ...d }));
  }

  async getTrajectoryHistory(studentId: string, dimension: CapabilityDimensionKey | "overall"): Promise<SeriesPoint[]> {
    return [...(this.require(studentId).trajectories[dimension] ?? [])];
  }

  async getTarget(studentId: string): Promise<ReadinessTarget | null> {
    return this.require(studentId).target;
  }

  async getEvidenceQualitySummary(studentId: string): Promise<EvidenceQualitySummary> {
    return this.require(studentId).evidenceQuality;
  }

  async getPracticeVsAssessment(studentId: string) {
    return this.require(studentId).practiceVsAssessment;
  }

  async getFamiliarityVsNovel(studentId: string) {
    return this.require(studentId).familiarityVsNovel;
  }

  async getFailureBoundary(studentId: string) {
    return this.require(studentId).failureBoundary;
  }

  async getStudentSelfReportedConfidence(studentId: string) {
    return this.require(studentId).selfReportedConfidence;
  }

  hasStudent(studentId: string): boolean {
    return this.students.has(studentId);
  }

  allStudentIds(): string[] {
    return [...this.students.keys()];
  }
}

export type { StudentFixture };
