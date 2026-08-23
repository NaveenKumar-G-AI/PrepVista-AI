import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { student } from "../db/schema";
import { getLatestSnapshot } from "./readinessService";

/**
 * "1,248 Students / Ready 428 / Almost Ready 317 / Needs Action 362 / High
 *  Risk 91" (spec §73). Risk-derived buckets are mutually exclusive;
 * improving/declining are a separate, overlapping momentum cut. Students
 * with no snapshot yet are their own bucket, never folded into "High Risk".
 */
export async function getInstitutionOverview(institutionId: string, seasonId: string) {
  const students = await db
    .select()
    .from(student)
    .where(and(eq(student.institutionId, institutionId), eq(student.seasonId, seasonId)));

  let ready = 0;
  let almostReady = 0;
  let needsIntervention = 0;
  let highRisk = 0;
  let noRecentData = 0;
  let improving = 0;
  let declining = 0;

  for (const s of students) {
    const snap = await getLatestSnapshot(s.id);
    if (!snap || snap.overallScore === null) {
      noRecentData++;
      continue;
    }
    if (snap.riskLevel === "LOW") ready++;
    else if (snap.riskLevel === "MEDIUM") almostReady++;
    else if (snap.riskLevel === "HIGH") needsIntervention++;
    else if (snap.riskLevel === "CRITICAL") highRisk++;

    if (snap.momentum === "RISING") improving++;
    if (snap.momentum === "DECLINING") declining++;
  }

  return {
    totalStudents: students.length,
    ready,
    almostReady,
    needsIntervention,
    highRisk,
    noRecentData,
    improving,
    declining,
  };
}
