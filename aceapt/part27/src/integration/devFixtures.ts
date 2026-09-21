/**
 * TEST FIXTURES — for local dev, tests, and `npm run seed:demo` only (spec
 * section 64: fixtures are fine for dev/testing; the real demo output must
 * come from the real pipeline — and it does: every number `npm run
 * seed:demo` prints is computed by the actual engines over this seeded
 * evidence, nothing is pre-written). Numbers here echo several of the
 * spec's own worked examples (sections 11, 18, 27, 28, 29) so the demo
 * output reads as a direct answer to the document, not a coincidence.
 */
import { addDays } from "../utils/dates.js";
import { CAPABILITY_DIMENSIONS } from "../domain/constants.js";
import type { CapabilityDimensionKey, SeriesPoint } from "../domain/types.js";
import type { InMemoryPlatformEvidenceGateway, StudentFixture } from "./inMemoryPlatformEvidenceGateway.js";

function weeklySeries(now: Date, valuesOldToNew: number[]): SeriesPoint[] {
  const n = valuesOldToNew.length;
  return valuesOldToNew.map((value, i) => ({
    date: addDays(now, -(n - 1 - i) * 7).toISOString(),
    value,
  }));
}

export const DEMO_STUDENT_ID = "demo-student";
export const DEMO_COHORT_ID = "cohort-2026-cs";

export function seedDemoFixtures(
  gateway: InMemoryPlatformEvidenceGateway,
  cohortMembership: Map<string, string[]>,
  now: Date = new Date(),
): void {
  if (gateway.hasStudent(DEMO_STUDENT_ID)) return; // idempotent — safe to call more than once
  seedStarStudent(gateway, now);
  const others = seedSyntheticCohort(gateway, now);
  cohortMembership.set(DEMO_COHORT_ID, [DEMO_STUDENT_ID, ...others]);
}

function seedStarStudent(gateway: InMemoryPlatformEvidenceGateway, now: Date): void {
  const dimensions = [
    { key: "mastery" as const, latestValue: 85, observationCount: 18 },
    { key: "retention" as const, latestValue: 82, observationCount: 14 },
    { key: "transfer" as const, latestValue: 61, observationCount: 9 },
    { key: "accuracy" as const, latestValue: 83, observationCount: 16 },
    { key: "speed" as const, latestValue: 67, observationCount: 10 },
    { key: "consistency" as const, latestValue: 72, observationCount: 8 },
  ].map((d) => ({ ...d, lastUpdated: now.toISOString() }));

  const fixture: StudentFixture = {
    dimensions,
    trajectories: {
      mastery: weeklySeries(now, [81, 83, 84, 85, 85]),
      retention: weeklySeries(now, [80, 81, 82, 81, 82]),
      transfer: weeklySeries(now, [42, 50, 55, 61]), // section 14's rising example
      accuracy: weeklySeries(now, [78, 80, 81, 82, 83]),
      speed: weeklySeries(now, [58, 60, 62, 64, 67]), // section 14's slow-improvement example
      consistency: [
        // section 24's stagnation example, almost verbatim
        { date: addDays(now, -25).toISOString(), value: 72 },
        { date: addDays(now, -20).toISOString(), value: 73 },
        { date: addDays(now, -15).toISOString(), value: 72 },
        { date: addDays(now, -10).toISOString(), value: 74 },
        { date: addDays(now, -5).toISOString(), value: 73 },
        { date: now.toISOString(), value: 72 },
      ],
      overall: weeklySeries(now, [63, 67, 70, 73, 75]),
    },
    target: {
      studentId: DEMO_STUDENT_ID,
      targetDimensions: { mastery: 85, retention: 80, transfer: 75, accuracy: 85, speed: 78, consistency: 80 },
      overallTarget: 82, // section 17/45's worked example
      assessmentDate: addDays(now, 15).toISOString(),
      assessmentLabel: "Placement Aptitude Assessment",
    },
    evidenceQuality: {
      observationCount: 34,
      recencyDaysAvg: 4,
      topicDiversity: 0.72,
      difficultyDiversity: 0.68,
      noveltyRatio: 0.55,
      hasTransferEvidence: true,
      hasAssessmentEvidence: true,
      hasTimedEvidence: true,
      historicalStability: 0.6,
      // section 18's exact worked example: "5 recent assessments, 11 adaptive sessions"
      breakdown: { assessments: 5, adaptiveSessions: 11, practiceQuestions: 18 },
    },
    practiceVsAssessment: { practiceScore: 91, assessmentScore: 74 }, // section 27
    familiarityVsNovel: { familiarScore: 92, novelScore: 63 }, // section 29
    failureBoundary: [
      // section 28's exact worked example
      { stage: "NORMAL", score: 91 },
      { stage: "MIXED", score: 86 },
      { stage: "NOVEL", score: 77 },
      { stage: "TIMED", score: 69 },
      { stage: "SIMULATION", score: 63 },
    ],
    selfReportedConfidence: 70, // deliberately below measured evidence — section 42
  };

  gateway.seedStudent(DEMO_STUDENT_ID, fixture);
}

interface SyntheticSpec {
  id: string;
  current: number;
  target: number;
  trend: number[];
  observationCount: number;
}

/** A handful of simpler filler students so the cohort/TPO endpoint has a mix
 * of statuses to aggregate (section 51-52). Not individually explored in the
 * demo narrative — only demo-student is. */
function seedSyntheticCohort(gateway: InMemoryPlatformEvidenceGateway, now: Date): string[] {
  const specs: SyntheticSpec[] = [
    { id: "cohort-student-b", current: 88, target: 80, trend: [70, 76, 82, 86, 88], observationCount: 22 }, // on track
    { id: "cohort-student-c", current: 54, target: 80, trend: [58, 57, 56, 55, 54], observationCount: 12 }, // at risk / regressing
    { id: "cohort-student-d", current: 62, target: 80, trend: [61, 62], observationCount: 2 }, // not enough evidence
    { id: "cohort-student-e", current: 90, target: 78, trend: [80, 84, 87, 89, 90], observationCount: 19 }, // target reached
    { id: "cohort-student-f", current: 68, target: 80, trend: [64, 66, 67, 68], observationCount: 6 }, // developing
  ];

  for (const spec of specs) {
    const dimensions = CAPABILITY_DIMENSIONS.map((key: CapabilityDimensionKey) => ({
      key,
      latestValue: spec.current,
      observationCount: spec.observationCount,
      lastUpdated: now.toISOString(),
    }));

    const targetDimensions: Partial<Record<CapabilityDimensionKey, number>> = {};
    for (const key of CAPABILITY_DIMENSIONS) targetDimensions[key] = spec.target;

    const trajectories: StudentFixture["trajectories"] = { overall: weeklySeries(now, spec.trend) };
    for (const key of CAPABILITY_DIMENSIONS) trajectories[key] = weeklySeries(now, spec.trend);

    const fixture: StudentFixture = {
      dimensions,
      trajectories,
      target: {
        studentId: spec.id,
        targetDimensions,
        overallTarget: spec.target,
        assessmentDate: addDays(now, 15).toISOString(),
        assessmentLabel: "Placement Aptitude Assessment",
      },
      evidenceQuality: {
        observationCount: spec.observationCount,
        recencyDaysAvg: 6,
        topicDiversity: 0.5,
        difficultyDiversity: 0.5,
        noveltyRatio: 0.4,
        hasTransferEvidence: spec.observationCount > 5,
        hasAssessmentEvidence: spec.observationCount > 5,
        hasTimedEvidence: spec.observationCount > 5,
        historicalStability: 0.5,
        breakdown: {
          assessments: Math.max(1, Math.round(spec.observationCount * 0.2)),
          adaptiveSessions: Math.max(1, Math.round(spec.observationCount * 0.5)),
          practiceQuestions: Math.max(1, Math.round(spec.observationCount * 0.3)),
        },
      },
      practiceVsAssessment: null,
      familiarityVsNovel: null,
      failureBoundary: null,
      selfReportedConfidence: null,
    };
    gateway.seedStudent(spec.id, fixture);
  }

  return specs.map((s) => s.id);
}
