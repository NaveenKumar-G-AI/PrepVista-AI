import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { readinessSnapshot, skill, skillMeasurement, student, interventionAssignment } from "../db/schema";
import { newId } from "../lib/id";
import { eventBus } from "../lib/eventBus";
import { THRESHOLDS } from "../config/thresholds";

const CALCULATION_VERSION = "readiness-v1";

export type CategoryScores = Record<string, { score: number; evidenceCount: number } | null>;

export interface ReadinessResult {
  id: string;
  studentId: string;
  overallScore: number | null;
  categoryScores: CategoryScores;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  momentum: "RISING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
  calculatedAt: Date;
  sourceSummary: Record<string, unknown>;
}

/** Latest measurement per skill for a student — reduced in JS rather than a
 *  SQL window function, which is plenty fast at per-student scale. At
 *  institution-wide scale, replace with a DISTINCT ON query (see
 *  docs/INTEGRATION_NOTES.md "Performance follow-ups"). */
async function latestMeasurementPerSkill(studentId: string) {
  const rows = await db
    .select()
    .from(skillMeasurement)
    .where(eq(skillMeasurement.studentId, studentId))
    .orderBy(desc(skillMeasurement.measuredAt));

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.skillId)) latest.set(row.skillId, row);
  }
  return [...latest.values()];
}

function riskFromScore(score: number | null): ReadinessResult["riskLevel"] {
  if (score === null) return "UNKNOWN"; // never silently "poor" — spec §57
  if (score < THRESHOLDS.RISK_BANDS.CRITICAL_BELOW) return "CRITICAL";
  if (score < THRESHOLDS.RISK_BANDS.HIGH_BELOW) return "HIGH";
  if (score < THRESHOLDS.RISK_BANDS.MEDIUM_BELOW) return "MEDIUM";
  return "LOW";
}

/**
 * Recalculates a student's readiness from real, currently-stored evidence
 * and writes a new, immutable snapshot. Categories/overall score are `null`
 * — never 0 — when there's no evidence yet (spec §57).
 */
export async function calculateReadiness(params: {
  studentId: string;
  institutionId: string;
  seasonId: string;
}): Promise<ReadinessResult> {
  const { studentId, institutionId, seasonId } = params;

  const measurements = await latestMeasurementPerSkill(studentId);

  let categoryScores: CategoryScores = {};
  if (measurements.length > 0) {
    const skillRows = await db
      .select()
      .from(skill)
      .where(inArray(skill.id, measurements.map((m) => m.skillId)));
    const categoryBySkill = new Map(skillRows.map((s) => [s.id, s.category ?? "uncategorized"]));

    const byCategory = new Map<string, number[]>();
    for (const m of measurements) {
      const cat = categoryBySkill.get(m.skillId) ?? "uncategorized";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(m.score);
    }
    for (const [cat, scores] of byCategory) {
      categoryScores[cat] = {
        score: round1(average(scores)),
        evidenceCount: scores.length,
      };
    }
  }

  const availableCategoryScores = Object.values(categoryScores).filter((c): c is { score: number; evidenceCount: number } => c !== null);
  const overallScore = availableCategoryScores.length > 0 ? round1(average(availableCategoryScores.map((c) => c.score))) : null;

  const previousSnapshots = await db
    .select()
    .from(readinessSnapshot)
    .where(eq(readinessSnapshot.studentId, studentId))
    .orderBy(desc(readinessSnapshot.calculatedAt))
    .limit(THRESHOLDS.MIN_SNAPSHOTS_FOR_MOMENTUM);

  const momentum = computeMomentum(overallScore, previousSnapshots.map((s) => s.overallScore));
  const riskLevel = riskFromScore(overallScore);

  const row = {
    id: newId("readi"),
    studentId,
    seasonId,
    overallScore,
    categoryScores,
    riskLevel,
    momentum,
    calculationVersion: CALCULATION_VERSION,
    sourceSummary: {
      skillMeasurementsUsed: measurements.length,
      categoriesWithData: availableCategoryScores.length,
      priorSnapshotsConsidered: previousSnapshots.length,
    },
  };

  const [inserted] = await db.insert(readinessSnapshot).values(row).returning();

  const prev = previousSnapshots[0]?.overallScore ?? null;
  await eventBus.publish({
    type: "READINESS_UPDATED",
    institutionId,
    studentId,
    payload: { previousScore: prev, currentScore: overallScore },
  });
  if (prev !== null && overallScore !== null) {
    const delta = overallScore - prev;
    if (delta >= THRESHOLDS.MOMENTUM_DELTA) {
      await eventBus.publish({
        type: "READINESS_IMPROVED",
        institutionId,
        studentId,
        payload: { previousScore: prev, currentScore: overallScore, delta },
      });
    } else if (delta <= -THRESHOLDS.MOMENTUM_DELTA) {
      await eventBus.publish({
        type: "READINESS_DECLINED",
        institutionId,
        studentId,
        payload: { previousScore: prev, currentScore: overallScore, delta },
      });
    }
  }

  return inserted as ReadinessResult;
}

function computeMomentum(current: number | null, priorScores: (number | null)[]): ReadinessResult["momentum"] {
  const comparablePrior = priorScores.find((s) => s !== null) ?? null;
  if (current === null || comparablePrior === null) return "INSUFFICIENT_DATA";
  const delta = current - comparablePrior;
  if (delta >= THRESHOLDS.MOMENTUM_DELTA) return "RISING";
  if (delta <= -THRESHOLDS.MOMENTUM_DELTA) return "DECLINING";
  return "STABLE";
}

export async function getLatestSnapshot(studentId: string) {
  const [row] = await db
    .select()
    .from(readinessSnapshot)
    .where(eq(readinessSnapshot.studentId, studentId))
    .orderBy(desc(readinessSnapshot.calculatedAt))
    .limit(1);
  return row ?? null;
}

/** Current vs previous snapshot (spec §33). Returns `hasEnoughData: false`
 *  rather than a fabricated "0 change" when there's only one snapshot. */
export async function getReadinessChange(studentId: string) {
  const rows = await db
    .select()
    .from(readinessSnapshot)
    .where(eq(readinessSnapshot.studentId, studentId))
    .orderBy(desc(readinessSnapshot.calculatedAt))
    .limit(2);

  if (rows.length < 2 || rows[0].overallScore === null || rows[1].overallScore === null) {
    return { hasEnoughData: false, current: rows[0]?.overallScore ?? null, previous: null, change: null };
  }
  return {
    hasEnoughData: true,
    current: rows[0].overallScore,
    previous: rows[1].overallScore,
    change: round1(rows[0].overallScore - rows[1].overallScore),
  };
}

/** Full history plus 7-day/30-day-lookback deltas (spec §33). */
export async function getReadinessTrend(studentId: string) {
  const history = await db
    .select()
    .from(readinessSnapshot)
    .where(eq(readinessSnapshot.studentId, studentId))
    .orderBy(desc(readinessSnapshot.calculatedAt));

  if (history.length === 0) {
    return { hasData: false as const, history: [] };
  }

  const latest = history[0];
  const changeSince = (days: number) => {
    const cutoff = new Date(latest.calculatedAt.getTime() - days * 24 * 60 * 60 * 1000);
    const reference = history.find((h) => h.calculatedAt <= cutoff);
    if (!reference || reference.overallScore === null || latest.overallScore === null) return null;
    return round1(latest.overallScore - reference.overallScore);
  };

  return {
    hasData: true as const,
    latest,
    history,
    change7Day: changeSince(7),
    change30Day: changeSince(30),
  };
}

/** Aggregate readiness for a department (spec §54). No-data students are
 *  reported as their own bucket, never averaged in as low scores. */
export async function getDepartmentReadiness(institutionId: string, seasonId: string, department: string) {
  const students = await db
    .select()
    .from(student)
    .where(and(eq(student.institutionId, institutionId), eq(student.seasonId, seasonId), eq(student.department, department)));

  const withData: number[] = [];
  let noData = 0;
  const riskCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0 };

  for (const s of students) {
    const snap = await getLatestSnapshot(s.id);
    if (!snap || snap.overallScore === null) {
      noData += 1;
      riskCounts.UNKNOWN += 1;
    } else {
      withData.push(snap.overallScore);
      riskCounts[snap.riskLevel] = (riskCounts[snap.riskLevel] ?? 0) + 1;
    }
  }

  return {
    department,
    totalStudents: students.length,
    studentsWithData: withData.length,
    studentsWithNoData: noData,
    averageReadiness: withData.length > 0 ? round1(average(withData)) : null,
    riskDistribution: riskCounts,
  };
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- Read helpers backing the AI tool contracts (spec §60, §88) -----------

async function studentsWithLatestSnapshots(institutionId: string, seasonId: string) {
  const students = await db
    .select()
    .from(student)
    .where(and(eq(student.institutionId, institutionId), eq(student.seasonId, seasonId)));
  const out: { student: (typeof students)[number]; snapshot: Awaited<ReturnType<typeof getLatestSnapshot>> }[] = [];
  for (const s of students) {
    out.push({ student: s, snapshot: await getLatestSnapshot(s.id) });
  }
  return out;
}

export async function getAtRiskStudents(institutionId: string, seasonId: string) {
  const rows = await studentsWithLatestSnapshots(institutionId, seasonId);
  return rows.filter((r) => r.snapshot?.riskLevel === "HIGH" || r.snapshot?.riskLevel === "CRITICAL").map((r) => ({ studentId: r.student.id, name: r.student.name, department: r.student.department, riskLevel: r.snapshot!.riskLevel, overallScore: r.snapshot!.overallScore }));
}

/** At-risk AND not already covered by an active intervention (spec §35 risk
 *  signals feeding into §39/§94 "N students require immediate intervention"). */
export async function getStudentsNeedingIntervention(institutionId: string, seasonId: string) {
  const atRisk = await getAtRiskStudents(institutionId, seasonId);
  if (atRisk.length === 0) return [];

  const active = await db
    .select({ studentId: interventionAssignment.studentId })
    .from(interventionAssignment)
    .where(
      and(
        inArray(interventionAssignment.studentId, atRisk.map((r) => r.studentId)),
        inArray(interventionAssignment.status, ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "OVERDUE"])
      )
    );
  const alreadyCovered = new Set(active.map((a) => a.studentId));

  return atRisk.filter((r) => !alreadyCovered.has(r.studentId));
}
