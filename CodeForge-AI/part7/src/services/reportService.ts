import { PoolClient } from 'pg';
import { aiRouter } from '../integrations/aiProvider';

/**
 * Every field here is read from persisted structured rows; the AI-generated
 * `narrative` is layered ON TOP of that data, never a replacement for it
 * (section 73 — "do not store only a generated AI paragraph").
 */
export async function buildStudentReport(client: PoolClient, assessmentId: string) {
  const {
    rows: [assessment],
  } = await client.query(
    `SELECT a.*, r.name AS role_name, u.display_name AS student_name
     FROM assessments a
     JOIN roles r ON r.id = a.role_id
     JOIN students st ON st.id = a.student_id
     JOIN app_users u ON u.id = st.id
     WHERE a.id = $1`,
    [assessmentId]
  );

  const { rows: skillResults } = await client.query(
    `SELECT sr.*, sk.name AS skill_name FROM assessment_skill_results sr JOIN skills sk ON sk.id = sr.skill_id WHERE sr.assessment_id = $1`,
    [assessmentId]
  );

  const {
    rows: [readiness],
  } = await client.query(`SELECT * FROM assessment_readiness_results WHERE assessment_id = $1 ORDER BY computed_at DESC LIMIT 1`, [
    assessmentId,
  ]);

  const { rows: events } = await client.query(
    `SELECT event_type, payload, created_at FROM assessment_events WHERE assessment_id = $1 ORDER BY created_at`,
    [assessmentId]
  );

  const { output: narrative, providerUsed } = await aiRouter.generateQualitativeSummary({
    studentName: assessment.student_name,
    targetRole: assessment.role_name,
    readinessState: readiness?.readiness_state ?? 'not_started',
    readinessConfidence: readiness?.readiness_confidence ?? 'low',
    skillResults: skillResults.map((r) => ({
      skill_name: r.skill_name,
      performance_level: r.performance_level,
      evidence_level: r.evidence_level,
    })),
  });

  return {
    target_role: assessment.role_name,
    assessment_purpose: assessment.purpose,
    overall_readiness: readiness?.readiness_state ?? 'not_started',
    readiness_confidence: readiness?.readiness_confidence ?? 'low',
    competency_breakdown: skillResults.map((r) => ({
      skill: r.skill_name,
      performance_level: r.performance_level,
      evidence_level: r.evidence_level,
      independence_score: r.independence_score,
      time_management_score: r.time_management_score,
    })),
    narrative,
    ai_provider_used: providerUsed, // 'groq' | 'gemini' | 'none' — visible so it's obvious when the deterministic fallback ran
    event_trail: events,
    generated_at: new Date().toISOString(),
  };
}

/**
 * TPO/management aggregate (sections 52, 80-81). Built exclusively from
 * assessments / assessment_skill_results / assessment_readiness_results —
 * tables with an explicit TPO-institution-scoped RLS policy. It never
 * queries assessment_submissions (raw code), which has no TPO policy at
 * all, so this function structurally cannot leak an individual student's
 * code even if called incorrectly.
 */
export async function buildCohortReport(client: PoolClient, roleId: string) {
  const { rows: readinessDist } = await client.query(
    `SELECT DISTINCT ON (student_id) student_id, readiness_state
     FROM assessment_readiness_results WHERE role_id = $1 ORDER BY student_id, computed_at DESC`,
    [roleId]
  );
  const distribution: Record<string, number> = {};
  for (const r of readinessDist) distribution[r.readiness_state] = (distribution[r.readiness_state] || 0) + 1;

  const { rows: gapRows } = await client.query(
    `SELECT sk.name AS skill_name,
            COUNT(*) FILTER (WHERE sr.performance_level IN ('weak','developing')) AS gap_count,
            COUNT(*) AS total
     FROM assessment_skill_results sr
     JOIN skills sk ON sk.id = sr.skill_id
     JOIN assessments a ON a.id = sr.assessment_id
     WHERE a.role_id = $1
     GROUP BY sk.name ORDER BY gap_count DESC`,
    [roleId]
  );

  const {
    rows: [completion],
  } = await client.query(
    `SELECT COUNT(*)::int AS total_assessments, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM assessments WHERE role_id = $1`,
    [roleId]
  );

  return {
    students_with_readiness_result: readinessDist.length,
    completion,
    readiness_distribution: distribution,
    competency_gap_ranking: gapRows,
  };
}
