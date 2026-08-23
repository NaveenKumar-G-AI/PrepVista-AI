import type { EvidenceRepository } from "../repositories/evidenceRepository.js";
import type {
  ApplicationRepository,
  InterviewRepository,
  JoiningRepository,
  OfferRepository,
  StudentRepository,
} from "../repositories/sourceRepositories.js";
import type { DataQualityResult, ReportWarning } from "../types.js";

export class DataQualityService {
  constructor(
    private students: StudentRepository,
    private applications: ApplicationRepository,
    private interviews: InterviewRepository,
    private offers: OfferRepository,
    private joining: JoiningRepository,
    private evidence: EvidenceRepository
  ) {}

  /** Section 31 (soft warnings) + section 47 (hard integrity issues), kept separate on purpose. */
  getWarningsAndIssues(
    institutionId: string,
    season: string
  ): { warnings: ReportWarning[]; integrityIssues: ReportWarning[] } {
    const warnings: ReportWarning[] = [];
    const integrityIssues: ReportWarning[] = [];

    const offers = this.offers.findAll({ institutionId, season });
    const applications = this.applications.findAll({ institutionId, season });
    const appsById = new Map(applications.map((a) => [a.id, a]));

    const unverifiedOffers = offers.filter((o) => !o.verified);
    if (unverifiedOffers.length > 0) {
      warnings.push({
        code: "unverified_offers",
        severity: "warning",
        message: `${unverifiedOffers.length} offer(s) have not been verified.`,
        count: unverifiedOffers.length,
      });
    }

    let incompleteJoining = 0;
    let joinedWithoutAccepted = 0;
    let verifiedWithoutEvidence = 0;
    let offerWithoutSelection = 0;

    for (const offer of offers) {
      const joiningRec = this.joining.findByOfferId(offer.id);
      const app = appsById.get(offer.applicationId);

      if (offer.status === "accepted" && (!joiningRec || !joiningRec.verified)) {
        incompleteJoining++;
      }
      if (joiningRec?.status === "joined" && offer.status !== "accepted") {
        joinedWithoutAccepted++;
      }
      if (joiningRec?.status === "joined" && joiningRec.verified) {
        if (this.evidence.forEntity("joining", joiningRec.id).length === 0) {
          verifiedWithoutEvidence++;
        }
      }
      if (app && !["selected", "offered"].includes(app.status)) {
        offerWithoutSelection++;
      }
    }

    if (incompleteJoining > 0) {
      warnings.push({
        code: "incomplete_joining",
        severity: "warning",
        message: `Joining data is incomplete for ${incompleteJoining} student(s).`,
        count: incompleteJoining,
      });
    }
    if (joinedWithoutAccepted > 0) {
      integrityIssues.push({
        code: "joined_without_accepted_offer",
        severity: "critical",
        message: `${joinedWithoutAccepted} student(s) show as joined without an accepted offer on record.`,
        count: joinedWithoutAccepted,
      });
    }
    if (verifiedWithoutEvidence > 0) {
      integrityIssues.push({
        code: "verified_without_evidence",
        severity: "critical",
        message: `${verifiedWithoutEvidence} verified placement(s) have no evidence attached.`,
        count: verifiedWithoutEvidence,
      });
    }
    if (offerWithoutSelection > 0) {
      integrityIssues.push({
        code: "offer_without_selection",
        severity: "warning",
        message: `${offerWithoutSelection} offer(s) exist without a matching 'selected' application status.`,
        count: offerWithoutSelection,
      });
    }

    const interviews = this.interviews.findAll({ institutionId, season });
    const missingResults = interviews.filter((i) => i.completedAt !== null && i.result === "pending");
    if (missingResults.length > 0) {
      integrityIssues.push({
        code: "interview_result_missing",
        severity: "warning",
        message: `${missingResults.length} completed interview(s) have no recorded result.`,
        count: missingResults.length,
      });
    }

    const students = this.students.findAll({ institutionId, season });
    const seen = new Map<string, number>();
    for (const s of students) {
      const key = `${s.name.trim().toLowerCase()}|${s.department}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicateGroups = [...seen.values()].filter((c) => c > 1).length;
    if (duplicateGroups > 0) {
      integrityIssues.push({
        code: "possible_duplicate_student",
        severity: "info",
        message: `${duplicateGroups} possible duplicate student record(s) detected by name + department match. Review before publishing.`,
        count: duplicateGroups,
      });
    }

    return { warnings, integrityIssues };
  }

  /**
   * Section 32/69: "Report Data Quality" — deliberately NOT called an
   * accuracy score. It measures completeness/verification/consistency of
   * the data feeding the report, not whether the report's conclusions are
   * statistically valid.
   */
  computeQualityScore(institutionId: string, season: string): DataQualityResult {
    const offers = this.offers.findAll({ institutionId, season });
    const offerVerificationRate = offers.length
      ? offers.filter((o) => o.verified).length / offers.length
      : 1;

    const joiningRecs = offers
      .map((o) => this.joining.findByOfferId(o.id))
      .filter((j): j is NonNullable<typeof j> => j !== null);
    const claimedJoined = joiningRecs.filter((j) => j.status === "joined");
    const joiningVerificationRate = claimedJoined.length
      ? claimedJoined.filter((j) => j.verified).length / claimedJoined.length
      : 1;

    const withEvidence = claimedJoined.filter(
      (j) => this.evidence.forEntity("joining", j.id).length > 0
    ).length;
    const evidenceCoverage = claimedJoined.length ? withEvidence / claimedJoined.length : 1;

    const { integrityIssues } = this.getWarningsAndIssues(institutionId, season);
    const criticalCount = integrityIssues.filter((i) => i.severity === "critical").length;

    const factors = [
      { label: "Offer verification", score: round1(offerVerificationRate * 100) },
      { label: "Joining verification", score: round1(joiningVerificationRate * 100) },
      { label: "Evidence coverage", score: round1(evidenceCoverage * 100) },
    ];

    const base = factors.reduce((sum, f) => sum + f.score, 0) / factors.length;
    const score = Math.max(0, Math.min(100, Math.round(base - criticalCount * 5)));
    const status: DataQualityResult["status"] =
      score >= 90 ? "ready" : score >= 70 ? "needs_attention" : "blocked";

    return { score, status, factors };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
