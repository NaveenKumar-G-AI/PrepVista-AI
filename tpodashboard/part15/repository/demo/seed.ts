/**
 * PrepVista AI — Part 15
 *
 * ⚠️ SYNTHETIC DEMO DATA — NOT REAL INSTITUTIONAL DATA ⚠️
 *
 * Every number in this file was hand-constructed (not randomly generated) so that
 * totals reconcile exactly: department headcounts sum to the institution total,
 * engagement-status buckets sum to the remaining unplaced pool, etc. This exists
 * solely so the forecasting/gap/scenario logic has something real to compute
 * against and can be demonstrated end-to-end. Section 77 of the build spec
 * ("Synthetic-Data Elimination") requires that nothing like this ships to
 * production — see docs/PART15_INTEGRATION.md for what a real
 * PlacementDataRepository implementation must replace this with.
 */

import type {
  Company,
  CurrentSeasonSnapshot,
  Department,
  DepartmentSeasonState,
  Drive,
  PlacementTarget,
  RemainingPoolBucket,
  SeasonSummary,
  Student,
} from "../../types/placement-strategy.types.js";

export const CURRENT_SEASON_ID = "2026";
export const DATA_CUTOFF = "2026-08-13"; // "Data through 13 Aug 2026" — Section 20
export const CURRENT_SEASON_FRACTION_ELAPSED = 0.75;

export const DEPARTMENTS: Department[] = [
  { id: "CSE", name: "Computer Science & Engineering", totalStudents: 320 },
  { id: "ECE", name: "Electronics & Communication Engineering", totalStudents: 260 },
  { id: "MECH", name: "Mechanical Engineering", totalStudents: 180 },
  { id: "EEE", name: "Electrical & Electronics Engineering", totalStudents: 150 },
  { id: "CIVIL", name: "Civil Engineering", totalStudents: 130 },
  { id: "IT", name: "Information Technology", totalStudents: 151 },
  { id: "AI_DS", name: "AI & Data Science", totalStudents: 9 }, // new dept — small-sample safeguard target
];

// Institution total = 320+260+180+150+130+151+9 = 1200

// ── Per-department verified placements (sum = 941 = institution verifiedPlacements) ──
// CSE 270 + ECE 178 + MECH 142 + EEE 121 + CIVIL 99 + IT 124 + AI_DS 7 = 941
const DEPT_PLACED: Record<string, number> = {
  CSE: 270,
  ECE: 178, // 68.5% — deliberately below institutional average (the "at-risk" department)
  MECH: 142,
  EEE: 121,
  CIVIL: 99,
  IT: 124,
  AI_DS: 7,
};

// ── Per-department remaining-pool engagement buckets ──
// Each row sums to (deptTotal - deptPlaced). Columns sum to institution totals:
// OFFER_ACCEPTED_AWAITING_JOIN=31, IN_INTERVIEW_STAGE=58, APPLIED_AWAITING_INTERVIEW=84, NO_ACTIVE_APPLICATION=86
const DEPT_REMAINING: Record<string, { offerAccepted: number; interview: number; applied: number; noActive: number }> = {
  CSE: { offerAccepted: 7, interview: 13, applied: 14, noActive: 16 }, // 50
  ECE: { offerAccepted: 5, interview: 14, applied: 28, noActive: 35 }, // 82 — skewed toward not-yet-progressing
  MECH: { offerAccepted: 5, interview: 9, applied: 12, noActive: 12 }, // 38
  EEE: { offerAccepted: 4, interview: 7, applied: 9, noActive: 9 }, // 29
  CIVIL: { offerAccepted: 4, interview: 8, applied: 10, noActive: 9 }, // 31
  IT: { offerAccepted: 6, interview: 6, applied: 10, noActive: 5 }, // 27
  AI_DS: { offerAccepted: 0, interview: 1, applied: 1, noActive: 0 }, // 2
};

// ── Per-department funnel conversion rates (this season, stage-to-stage) ──
// ECE's interviewConversion (0.54) is deliberately the outlier — mirrors the
// build spec's own illustrative example almost exactly.
const DEPT_FUNNEL: Record<
  string,
  { applicationConversion: number; interviewConversion: number; offerAcceptanceConversion: number; joiningConversion: number; sampleSize: number }
> = {
  CSE: { applicationConversion: 0.74, interviewConversion: 0.72, offerAcceptanceConversion: 0.95, joiningConversion: 0.93, sampleSize: 340 },
  ECE: { applicationConversion: 0.68, interviewConversion: 0.54, offerAcceptanceConversion: 0.9, joiningConversion: 0.88, sampleSize: 275 },
  MECH: { applicationConversion: 0.7, interviewConversion: 0.6, offerAcceptanceConversion: 0.92, joiningConversion: 0.9, sampleSize: 190 },
  EEE: { applicationConversion: 0.72, interviewConversion: 0.66, offerAcceptanceConversion: 0.93, joiningConversion: 0.91, sampleSize: 158 },
  CIVIL: { applicationConversion: 0.66, interviewConversion: 0.58, offerAcceptanceConversion: 0.91, joiningConversion: 0.89, sampleSize: 136 },
  IT: { applicationConversion: 0.73, interviewConversion: 0.7, offerAcceptanceConversion: 0.94, joiningConversion: 0.92, sampleSize: 158 },
  // AI_DS looks flawless (N=9) — this is intentional bait for the small-sample guard.
  AI_DS: { applicationConversion: 0.8, interviewConversion: 0.8, offerAcceptanceConversion: 1.0, joiningConversion: 1.0, sampleSize: 9 },
};

// Minimum reliable department sample size lives in services/forecast/thresholds.ts
// (real business logic, not demo data) — imported from there below.

// ── Historical seasons (completed) ──
// checkpoint = placement % at the SAME fractional point (0.75) as the current
// season's cutoff, so the baseline "historical uplift" method compares like-for-like.
export const HISTORICAL_SEASONS: SeasonSummary[] = [
  { seasonId: "2022", label: "2022", fractionElapsedAtSnapshot: 0.75, placementPctAtComparableCheckpoint: 68.5, finalPlacementPct: 74.0, totalStudents: 1080, verifiedPlacements: 799, placementDefinitionVersion: "v2", readinessModelVersion: "v1" },
  { seasonId: "2023", label: "2023", fractionElapsedAtSnapshot: 0.75, placementPctAtComparableCheckpoint: 70.0, finalPlacementPct: 76.5, totalStudents: 1110, verifiedPlacements: 849, placementDefinitionVersion: "v2", readinessModelVersion: "v1" },
  { seasonId: "2024", label: "2024", fractionElapsedAtSnapshot: 0.75, placementPctAtComparableCheckpoint: 71.0, finalPlacementPct: 77.8, totalStudents: 1150, verifiedPlacements: 895, placementDefinitionVersion: "v2", readinessModelVersion: "v2" },
  { seasonId: "2025", label: "2025", fractionElapsedAtSnapshot: 0.75, placementPctAtComparableCheckpoint: 72.5, finalPlacementPct: 79.6, totalStudents: 1180, verifiedPlacements: 939, placementDefinitionVersion: "v2", readinessModelVersion: "v2" },
];

export const CURRENT_TARGET: PlacementTarget = {
  id: "target-2026-placement-pct",
  institutionId: "demo-institution",
  seasonId: CURRENT_SEASON_ID,
  metric: "PLACEMENT_PCT",
  targetValue: 85,
  targetDate: "2027-05-31",
  scope: "INSTITUTION",
  createdBy: "tpo-head",
  version: 1,
  status: "ACTIVE",
};

// ── Companies ──
// ABC Technologies / XYZ Analytics intentionally mirror the build spec's own
// illustrative outreach-priority example (18 historical hires, currently inactive).
export const COMPANIES: Company[] = [
  { id: "abc-tech", name: "ABC Technologies", industry: "IT", historicalHiresBySeason: { "2022": 14, "2023": 16, "2024": 18, "2025": 18 }, lastActiveSeasonId: "2025", relationshipStrength: 0.8 },
  { id: "xyz-analytics", name: "XYZ Analytics", industry: "IT Services", historicalHiresBySeason: { "2023": 6, "2024": 5 }, lastActiveSeasonId: "2024", relationshipStrength: 0.3 },
  { id: "novasoft", name: "NovaSoft Systems", industry: "IT", historicalHiresBySeason: { "2023": 150, "2024": 180, "2025": 195, "2026": 210 }, lastActiveSeasonId: "2026", relationshipStrength: 0.9 },
  { id: "orbit-cloud", name: "Orbit Cloud Labs", industry: "IT", historicalHiresBySeason: { "2024": 110, "2025": 125, "2026": 140 }, lastActiveSeasonId: "2026", relationshipStrength: 0.85 },
  { id: "redwood-data", name: "Redwood Data Systems", industry: "IT Services", historicalHiresBySeason: { "2025": 80, "2026": 95 }, lastActiveSeasonId: "2026", relationshipStrength: 0.75 },
  { id: "vertex-mfg", name: "Vertex Manufacturing", industry: "Manufacturing", historicalHiresBySeason: { "2023": 60, "2024": 70, "2025": 75, "2026": 80 }, lastActiveSeasonId: "2026", relationshipStrength: 0.8 },
  { id: "meridian-consulting", name: "Meridian Consulting", industry: "Consulting", historicalHiresBySeason: { "2024": 50, "2025": 58, "2026": 65 }, lastActiveSeasonId: "2026", relationshipStrength: 0.7 },
  { id: "summit-finance", name: "Summit Finance Partners", industry: "BFSI", historicalHiresBySeason: { "2025": 45, "2026": 58 }, lastActiveSeasonId: "2026", relationshipStrength: 0.65 },
  { id: "falcon-core", name: "Falcon Core Engineering", industry: "Manufacturing", historicalHiresBySeason: { "2024": 40, "2025": 48, "2026": 52 }, lastActiveSeasonId: "2026", relationshipStrength: 0.6 },
  { id: "blueriver-bfsi", name: "BlueRiver BFSI", industry: "BFSI", historicalHiresBySeason: { "2025": 42, "2026": 48 }, lastActiveSeasonId: "2026", relationshipStrength: 0.55 },
  { id: "coastal-health", name: "Coastal Healthcare Group", industry: "Healthcare", historicalHiresBySeason: { "2025": 30, "2026": 40 }, lastActiveSeasonId: "2026", relationshipStrength: 0.5 },
  { id: "pinnacle-sales", name: "Pinnacle Sales Solutions", industry: "Sales", historicalHiresBySeason: { "2026": 35 }, lastActiveSeasonId: "2026", relationshipStrength: 0.4 },
  { id: "horizon-qa", name: "Horizon QA Services", industry: "IT Services", historicalHiresBySeason: { "2025": 26, "2026": 30 }, lastActiveSeasonId: "2026", relationshipStrength: 0.5 },
];

/** Current-season verified offers attributed per company — used for concentration analysis. */
export const CURRENT_SEASON_OFFERS_BY_COMPANY: Record<string, number> = {
  novasoft: 210,
  "orbit-cloud": 140,
  "redwood-data": 95,
  "vertex-mfg": 80,
  "meridian-consulting": 65,
  "summit-finance": 58,
  "falcon-core": 52,
  "blueriver-bfsi": 48,
  "coastal-health": 40,
  "pinnacle-sales": 35,
  "horizon-qa": 30,
  "abc-tech": 0,
  "xyz-analytics": 0,
};

export const DRIVES: Drive[] = [
  { id: "drive-novasoft-2026", companyId: "novasoft", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["CSE", "IT"], requiredSkills: ["Java", "Data Structures"], roleCategory: "Software Engineering", seats: 60 },
  { id: "drive-orbit-2026", companyId: "orbit-cloud", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["CSE", "IT", "ECE"], requiredSkills: ["Cloud/AWS", "Python"], roleCategory: "Cloud/DevOps", seats: 40 },
  { id: "drive-redwood-2026", companyId: "redwood-data", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["CSE", "IT", "ECE", "EEE"], requiredSkills: ["SQL", "Python"], roleCategory: "Data Analytics", seats: 45 },
  { id: "drive-vertex-2026", companyId: "vertex-mfg", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["MECH", "EEE", "CIVIL"], requiredSkills: ["Manufacturing Systems"], roleCategory: "Core Engineering", seats: 50 },
  { id: "drive-meridian-2026", companyId: "meridian-consulting", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["CSE", "IT", "MECH", "EEE", "CIVIL", "ECE"], requiredSkills: ["Communication", "Data Structures"], roleCategory: "Consulting", seats: 30 },
  { id: "drive-summit-2026", companyId: "summit-finance", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["CSE", "IT"], requiredSkills: ["Financial Modeling", "Communication"], roleCategory: "Finance", seats: 20 },
  { id: "drive-falcon-2026", companyId: "falcon-core", seasonId: CURRENT_SEASON_ID, status: "OPEN", eligibleDepartmentIds: ["MECH", "EEE"], requiredSkills: ["Manufacturing Systems", "Data Structures"], roleCategory: "Core Engineering", seats: 25 },
];

const SKILL_POOL = ["SQL", "Python", "Java", "React", "Data Structures", "Communication", "Cloud/AWS", "Manufacturing Systems", "Financial Modeling", "QA/Testing"];

const DEPT_SKILL_BIAS: Record<string, string[]> = {
  CSE: ["Java", "Data Structures", "Python", "SQL", "Cloud/AWS"],
  IT: ["SQL", "Python", "Cloud/AWS", "Data Structures", "QA/Testing"],
  ECE: ["Python", "Communication", "SQL"],
  EEE: ["Manufacturing Systems", "Communication", "Data Structures"],
  MECH: ["Manufacturing Systems", "Communication"],
  CIVIL: ["Manufacturing Systems", "Communication"],
  AI_DS: ["Python", "SQL", "Data Structures"],
};

/**
 * Deterministic (not random) per-student generation so results never change between
 * runs. Status counts are drawn down from the DEPT_PLACED / DEPT_REMAINING tables
 * above so every department total reconciles exactly.
 */
export function buildStudents(): Student[] {
  const students: Student[] = [];
  for (const dept of DEPARTMENTS) {
    const placed = DEPT_PLACED[dept.id] ?? 0;
    const remaining = DEPT_REMAINING[dept.id] ?? { offerAccepted: 0, interview: 0, applied: 0, noActive: 0 };
    const bias = DEPT_SKILL_BIAS[dept.id] ?? SKILL_POOL.slice(0, 3);
    let seq = 0;

    const push = (status: Student["status"], count: number) => {
      for (let i = 0; i < count; i++) {
        seq++;
        // Deterministic pseudo-varied readiness score from a fixed formula (no RNG).
        const readiness = 55 + ((seq * 7 + dept.id.length * 3) % 40); // 55-94 range, deterministic
        const skillCount = 2 + (seq % 3); // 2-4 skills
        const skillTags = Array.from({ length: skillCount }, (_, k) => bias[(seq + k) % bias.length]!).filter(
          (s, idx, arr) => arr.indexOf(s) === idx
        );
        students.push({
          id: `${dept.id}-${status}-${seq}`,
          departmentId: dept.id,
          readinessScore: readiness,
          skillTags,
          status,
        });
      }
    };

    push("PLACED", placed);
    push("OFFER_ACCEPTED", remaining.offerAccepted);
    push("IN_PROCESS", remaining.interview + remaining.applied);
    push("NOT_ENGAGED", remaining.noActive);
  }
  return students;
}

export function buildRemainingPoolBuckets(): RemainingPoolBucket[] {
  let offerAccepted = 0;
  let interview = 0;
  let applied = 0;
  let noActive = 0;
  for (const d of Object.values(DEPT_REMAINING)) {
    offerAccepted += d.offerAccepted;
    interview += d.interview;
    applied += d.applied;
    noActive += d.noActive;
  }
  // Historical eventual-join rates (institution-level, from tracked prior-season cohorts).
  // In production these come from cohort tracking, not a hand-set constant — see
  // docs/PART15_INTEGRATION.md for the query shape a real repository needs to support.
  return [
    { status: "OFFER_ACCEPTED_AWAITING_JOIN", count: offerAccepted, historicalEventualJoinRate: 0.9 },
    { status: "IN_INTERVIEW_STAGE", count: interview, historicalEventualJoinRate: 0.35 },
    { status: "APPLIED_AWAITING_INTERVIEW", count: applied, historicalEventualJoinRate: 0.15 },
    { status: "NO_ACTIVE_APPLICATION", count: noActive, historicalEventualJoinRate: 0.03 },
  ];
}

export function buildCurrentSeasonSnapshot(asOf: string): CurrentSeasonSnapshot {
  const totalEligibleStudents = DEPARTMENTS.reduce((s, d) => s + d.totalStudents, 0);
  const verifiedPlacements = Object.values(DEPT_PLACED).reduce((s, n) => s + n, 0);
  return {
    seasonId: CURRENT_SEASON_ID,
    asOf,
    fractionElapsed: CURRENT_SEASON_FRACTION_ELAPSED,
    totalEligibleStudents,
    verifiedPlacements,
    remainingPool: buildRemainingPoolBuckets(),
    // Season-aggregate stage rates across ALL applications processed this season
    // (a rate/efficiency KPI — not a headcount reconciliation; a student can pass
    // through this funnel multiple times, once per drive applied to).
    institutionFunnelRates: {
      applicationConversion: 0.72,
      interviewConversion: 0.61,
      offerAcceptanceConversion: 0.93,
      joiningConversion: 0.91,
      sampleSize: 1450,
    },
    freshnessStatus: "LIVE",
    dataQualityFlags: ["3 joining records pending confirmation-date entry (does not affect this snapshot's totals)"],
  };
}

export function buildDepartmentSeasonState(departmentId: string, asOf: string): DepartmentSeasonState {
  const dept = DEPARTMENTS.find((d) => d.id === departmentId);
  if (!dept) throw new Error(`Unknown department: ${departmentId}`);
  const funnel = DEPT_FUNNEL[departmentId];
  if (!funnel) throw new Error(`No funnel data for department: ${departmentId}`);
  const remaining = DEPT_REMAINING[departmentId] ?? { offerAccepted: 0, interview: 0, applied: 0, noActive: 0 };
  // Department-level buckets reuse the INSTITUTION's historical eventual-join
  // rates per status, rather than fitting a department-specific rate — with
  // only a season or two of departmental history, a department-specific rate
  // would itself be a small-sample estimate. Structure (how many students are
  // in each bucket) is department-specific and reliable; the conversion RATE
  // applied to that structure is intentionally borrowed from the larger,
  // more stable institution-level sample. See PART15_HOSTILE_REVIEW.md finding F1.
  const institutionRates = buildRemainingPoolBuckets();
  const rateByStatus = new Map(institutionRates.map((b) => [b.status, b.historicalEventualJoinRate]));
  const remainingPool: RemainingPoolBucket[] = [
    { status: "OFFER_ACCEPTED_AWAITING_JOIN", count: remaining.offerAccepted, historicalEventualJoinRate: rateByStatus.get("OFFER_ACCEPTED_AWAITING_JOIN")! },
    { status: "IN_INTERVIEW_STAGE", count: remaining.interview, historicalEventualJoinRate: rateByStatus.get("IN_INTERVIEW_STAGE")! },
    { status: "APPLIED_AWAITING_INTERVIEW", count: remaining.applied, historicalEventualJoinRate: rateByStatus.get("APPLIED_AWAITING_INTERVIEW")! },
    { status: "NO_ACTIVE_APPLICATION", count: remaining.noActive, historicalEventualJoinRate: rateByStatus.get("NO_ACTIVE_APPLICATION")! },
  ];
  return {
    departmentId,
    seasonId: CURRENT_SEASON_ID,
    totalStudents: dept.totalStudents,
    verifiedPlacements: DEPT_PLACED[departmentId] ?? 0,
    funnelRates: funnel,
    remainingPool,
  };
}
