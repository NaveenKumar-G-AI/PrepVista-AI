import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  trainingEnrollment,
  trainingProgram,
  readinessSnapshot,
  interventionAssignment,
  intervention,
  skillMeasurement,
  interviewResult,
  offer,
} from "../db/schema";
import { THRESHOLDS } from "../config/thresholds";
import { NotFoundError } from "../lib/errors";
import { eventBus } from "../lib/eventBus";

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function snapshotBefore(studentId: string, date: Date) {
  const [row] = await db
    .select()
    .from(readinessSnapshot)
    .where(and(eq(readinessSnapshot.studentId, studentId), lte(readinessSnapshot.calculatedAt, date)))
    .orderBy(desc(readinessSnapshot.calculatedAt))
    .limit(1);
  return row ?? null;
}

async function snapshotAfter(studentId: string, date: Date) {
  const [row] = await db
    .select()
    .from(readinessSnapshot)
    .where(and(eq(readinessSnapshot.studentId, studentId), gte(readinessSnapshot.calculatedAt, date)))
    .orderBy(asc(readinessSnapshot.calculatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * "Technical Interview Bootcamp — Pre-readiness 53 → Post-readiness 69" style
 * report (spec §43, §75). Below THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS
 * completers with usable before/after data, numbers are withheld rather
 * than shown as a possibly-meaningless statistic (spec §44).
 */
export async function getTrainingEffectiveness(trainingProgramId: string) {
  const [program] = await db.select().from(trainingProgram).where(eq(trainingProgram.id, trainingProgramId));
  if (!program) throw new NotFoundError("TrainingProgram", trainingProgramId);

  const enrollments = await db.select().from(trainingEnrollment).where(eq(trainingEnrollment.trainingProgramId, trainingProgramId));
  const assigned = enrollments.length;
  const started = enrollments.filter((e) => e.status !== "ASSIGNED").length;
  const completers = enrollments.filter((e) => e.status === "COMPLETED" && e.completedAt);
  const completionRate = assigned > 0 ? Math.round((completers.length / assigned) * 1000) / 10 : null;

  const pairs: { pre: number; post: number }[] = [];
  for (const e of completers) {
    const pre = await snapshotBefore(e.studentId, e.enrolledAt);
    const post = await snapshotAfter(e.studentId, e.completedAt!);
    if (pre?.overallScore != null && post?.overallScore != null) {
      pairs.push({ pre: pre.overallScore, post: post.overallScore });
    }
  }

  const readinessImpact =
    pairs.length >= THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS
      ? {
          insufficientData: false as const,
          sampleSize: pairs.length,
          medianPreReadiness: median(pairs.map((p) => p.pre)),
          medianPostReadiness: median(pairs.map((p) => p.post)),
          medianObservedChange: median(pairs.map((p) => p.post - p.pre)),
        }
      : { insufficientData: true as const, sampleSize: pairs.length, minimumRequired: THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS };

  // Downstream, observed-only (spec §75: "only show if the data actually exists", never causal)
  let interviewProgression: { completersWithInterviewAfter: number; ofCompleters: number } | null = null;
  if (completers.length > 0) {
    let withInterview = 0;
    for (const e of completers) {
      const rows = await db.select().from(interviewResult).where(eq(interviewResult.studentId, e.studentId));
      if (rows.some((r) => r.interviewedAt >= e.completedAt!)) withInterview++;
    }
    interviewProgression = { completersWithInterviewAfter: withInterview, ofCompleters: completers.length };
  }

  const result = {
    trainingProgramId,
    programName: program.name,
    assigned,
    started,
    completed: completers.length,
    completionRate,
    readinessImpact,
    interviewProgression,
    note: "readinessImpact is an observed before/after difference among completers, not a causal claim.",
  };

  await eventBus.publish({ type: "TRAINING_EFFECTIVENESS_UPDATED", institutionId: program.institutionId, payload: { trainingProgramId, completionRate } });
  return result;
}

/**
 * Per-intervention effectiveness (spec §45, §76): assigned/completed/
 * improved/unchanged/declined, plus downstream interview/offer counts.
 * "Improved" compares the target skill's (or overall readiness, if no
 * single target skill) score right before assignment vs right after
 * completion — again gated by minimum sample size.
 */
export async function getInterventionEffectiveness(interventionId: string) {
  const [interventionRow] = await db.select().from(intervention).where(eq(intervention.id, interventionId));
  if (!interventionRow) throw new NotFoundError("Intervention", interventionId);

  const assignments = await db.select().from(interventionAssignment).where(eq(interventionAssignment.interventionId, interventionId));
  const completed = assignments.filter((a) => a.status === "COMPLETED" && a.completedAt);

  let improved = 0;
  let unchanged = 0;
  let declined = 0;
  let comparable = 0;

  for (const a of completed) {
    const before = interventionRow.targetSkillId
      ? await latestSkillScoreBefore(a.studentId, interventionRow.targetSkillId, a.assignedAt)
      : (await snapshotBefore(a.studentId, a.assignedAt))?.overallScore ?? null;
    const after = interventionRow.targetSkillId
      ? await latestSkillScoreAfter(a.studentId, interventionRow.targetSkillId, a.completedAt!)
      : (await snapshotAfter(a.studentId, a.completedAt!))?.overallScore ?? null;

    if (before === null || after === null) continue;
    comparable++;
    const delta = after - before;
    if (delta >= THRESHOLDS.MOMENTUM_DELTA) improved++;
    else if (delta <= -THRESHOLDS.MOMENTUM_DELTA) declined++;
    else unchanged++;
  }

  let downstream: { completersWithInterviewAfter: number; completersWithOfferAfter: number; ofCompleters: number } | null = null;
  if (completed.length > 0) {
    let withInterview = 0;
    let withOffer = 0;
    for (const a of completed) {
      const interviews = await db.select().from(interviewResult).where(eq(interviewResult.studentId, a.studentId));
      if (interviews.some((r) => r.interviewedAt >= a.completedAt!)) withInterview++;
      const offers = await db.select().from(offer).where(eq(offer.studentId, a.studentId));
      if (offers.some((o) => o.offeredAt >= a.completedAt!)) withOffer++;
    }
    downstream = { completersWithInterviewAfter: withInterview, completersWithOfferAfter: withOffer, ofCompleters: completed.length };
  }

  return {
    interventionId,
    interventionName: interventionRow.name,
    assigned: assignments.length,
    completed: completed.length,
    comparableForImpact: comparable,
    insufficientDataForImpact: comparable < THRESHOLDS.MIN_SAMPLE_FOR_EFFECTIVENESS,
    improved,
    unchanged,
    declined,
    downstream,
    note: "improved/unchanged/declined reflect observed score movement among students with before-and-after data, not a causal claim.",
  };
}

async function latestSkillScoreBefore(studentId: string, skillId: string, date: Date) {
  const [row] = await db
    .select()
    .from(skillMeasurement)
    .where(and(eq(skillMeasurement.studentId, studentId), eq(skillMeasurement.skillId, skillId), lte(skillMeasurement.measuredAt, date)))
    .orderBy(desc(skillMeasurement.measuredAt))
    .limit(1);
  return row?.score ?? null;
}
async function latestSkillScoreAfter(studentId: string, skillId: string, date: Date) {
  const [row] = await db
    .select()
    .from(skillMeasurement)
    .where(and(eq(skillMeasurement.studentId, studentId), eq(skillMeasurement.skillId, skillId), gte(skillMeasurement.measuredAt, date)))
    .orderBy(asc(skillMeasurement.measuredAt))
    .limit(1);
  return row?.score ?? null;
}
