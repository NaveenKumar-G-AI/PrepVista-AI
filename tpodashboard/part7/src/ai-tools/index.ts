/**
 * Every function here is a thin, read-only wrapper around the services in
 * src/services/**. This file exists so a future AI assistant (Part 12) has
 * one place to import from and can NEVER reach the database directly
 * (spec §62: "No direct AI database access"). It also means an LLM can
 * explain/summarize/recommend from these results, but the numbers
 * themselves always come from real calculations, never from the model.
 *
 * Names follow spec §60. A `part12` namespace at the bottom re-exposes the
 * same functions under the dotted names from spec §88, since Part 12 (not
 * yet built) may call either convention.
 */
import * as readiness from "../services/readinessService";
import * as skillGaps from "../services/skillGapService";
import * as training from "../services/trainingService";
import * as assessmentSvc from "../services/assessmentService";
import * as intervention from "../services/interventionService";
import * as effectiveness from "../services/effectivenessService";

export async function getStudentReadiness(studentId: string) {
  const [latest, change] = await Promise.all([readiness.getLatestSnapshot(studentId), readiness.getReadinessChange(studentId)]);
  return { latest, change };
}

export async function getSkillGaps(studentId: string) {
  return skillGaps.getSkillGaps(studentId);
}

export async function getStudentTraining(studentId: string) {
  return training.getStudentTraining(studentId);
}

export async function getStudentAssessments(studentId: string) {
  return assessmentSvc.getStudentAssessments(studentId);
}

export async function getStudentInterventions(studentId: string) {
  return intervention.getStudentInterventions(studentId);
}

export async function getStudentsNeedingIntervention(institutionId: string, seasonId: string) {
  return readiness.getStudentsNeedingIntervention(institutionId, seasonId);
}

export async function getOverdueTraining(institutionId: string) {
  return training.getOverdueTraining(institutionId);
}

export async function getAssessmentResults(studentId: string) {
  return assessmentSvc.getAssessmentResults(studentId);
}

export async function getTrainingEffectiveness(trainingProgramId: string) {
  return effectiveness.getTrainingEffectiveness(trainingProgramId);
}

export async function getReadinessTrend(studentId: string) {
  return readiness.getReadinessTrend(studentId);
}

export async function getDepartmentReadiness(institutionId: string, seasonId: string, department: string) {
  return readiness.getDepartmentReadiness(institutionId, seasonId, department);
}

export async function getAtRiskStudents(institutionId: string, seasonId: string) {
  return readiness.getAtRiskStudents(institutionId, seasonId);
}

// ---- Deterministic insight objects (spec §61) ------------------------------

export interface Insight {
  type: "READINESS_DECLINE" | "TRAINING_NON_COMPLETION" | "OVERDUE_INTERVENTION";
  priority: "LOW" | "MEDIUM" | "HIGH";
  studentId: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
}

/** Scans real, already-calculated data for the patterns in spec §61's
 *  examples. An AI layer can narrate these; it must not invent new ones. */
export async function getInsights(institutionId: string, seasonId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  const atRisk = await readiness.getAtRiskStudents(institutionId, seasonId);
  for (const r of atRisk) {
    const change = await readiness.getReadinessChange(r.studentId);
    if (change.hasEnoughData && change.change !== null && change.change <= -5) {
      insights.push({
        type: "READINESS_DECLINE",
        priority: r.riskLevel === "CRITICAL" ? "HIGH" : "MEDIUM",
        studentId: r.studentId,
        evidence: { previousScore: change.previous, currentScore: change.current },
        recommendedAction: "Review recent assessment/training activity and consider an intervention.",
      });
    }
  }

  const overdueTraining = await training.getOverdueTraining(institutionId);
  const byStudent = new Map<string, number>();
  for (const row of overdueTraining) {
    byStudent.set(row.enrollment.studentId, (byStudent.get(row.enrollment.studentId) ?? 0) + 1);
  }
  for (const [studentId] of byStudent) {
    const summary = await training.getAttendanceSummary(overdueTraining.find((r) => r.enrollment.studentId === studentId)!.program.id);
    const own = summary.students.find((s) => s.studentId === studentId);
    insights.push({
      type: "TRAINING_NON_COMPLETION",
      priority: "MEDIUM",
      studentId,
      evidence: { attendanceRate: own?.attendancePct ?? null, requiredRate: 75 },
      recommendedAction: "Contact student and review training assignment.",
    });
  }

  return insights;
}

/** spec §88 dotted-name convenience aliases. */
export const part12 = {
  "student.readiness": getStudentReadiness,
  "student.skills": getSkillGaps,
  "student.training": getStudentTraining,
  "student.assessments": getStudentAssessments,
  "student.interventions": getStudentInterventions,
  "cohort.readiness": getDepartmentReadiness,
  "cohort.skill_gaps": getSkillGaps,
  "cohort.training_effectiveness": getTrainingEffectiveness,
  "students.needing_intervention": getStudentsNeedingIntervention,
};
