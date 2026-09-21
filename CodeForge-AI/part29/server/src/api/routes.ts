import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/client.js";
import {
  calculatePlateauAwareTrend,
} from "./trend.js";
import { generateGrowthNarrative } from "../ai/narrative.js";
import { requireAuth, requireCohortStaffAccess, requireStudentAccess, type AuthedRequest } from "./auth.js";
import type { TimePoint } from "../engine/index.js";

export const router = Router();
router.use(requireAuth);

const uuidParam = z.string().uuid();

async function loadSkillSeries(studentId: string, skillId: string): Promise<TimePoint[]> {
  const res = await pool.query(
    `select value, observed_at from technical_growth_snapshots
     where student_id = $1 and skill_id = $2 order by observed_at asc`,
    [studentId, skillId]
  );
  return res.rows.map((r) => ({ value: Number(r.value), observedAt: new Date(r.observed_at).toISOString() }));
}

async function loadSkillSummaries(studentId: string) {
  const latestSnapshots = await pool.query(
    `select distinct on (tgs.skill_id) tgs.skill_id, s.key as skill_key, s.name as skill_name,
            tgs.value, tgs.confidence, tgs.evidence_count, tgs.observed_at
     from technical_growth_snapshots tgs
     join skills s on s.id = tgs.skill_id
     where tgs.student_id = $1
     order by tgs.skill_id, tgs.observed_at desc`,
    [studentId]
  );

  const measurements = await pool.query(
    `select distinct on (skill_id) skill_id, absolute_change, relative_change, confidence, evidence_count
     from skill_growth_measurements
     where student_id = $1
     order by skill_id, calculated_at desc`,
    [studentId]
  );
  const measurementBySkill = new Map(measurements.rows.map((m) => [m.skill_id, m]));

  const summaries = [];
  for (const row of latestSnapshots.rows) {
    const series = await loadSkillSeries(studentId, row.skill_id);
    const trend = calculatePlateauAwareTrend(series);
    const measurement = measurementBySkill.get(row.skill_id);
    summaries.push({
      skillId: row.skill_id,
      skillKey: row.skill_key,
      skillName: row.skill_name,
      currentValue: Number(row.value),
      currentConfidence: row.confidence,
      evidenceCount: row.evidence_count,
      lastObservedAt: row.observed_at,
      growth: measurement
        ? {
            absoluteChange: Number(measurement.absolute_change),
            relativeChange: measurement.relative_change != null ? Number(measurement.relative_change) : null,
            confidence: measurement.confidence,
            evidenceCount: measurement.evidence_count,
          }
        : { unavailable: true, reason: "No comparable baseline yet, or not enough evidence separation." },
      trend,
    });
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/overview
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/overview", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  const skills = await loadSkillSummaries(studentId);

  const available = skills.filter((s) => !("unavailable" in s.growth));
  const overallGrowth =
    available.length > 0
      ? Math.round(
          (available.reduce((sum, s) => sum + (s.growth as any).absoluteChange, 0) / available.length) * 10
        ) / 10
      : null;

  const recentMilestones = await pool.query(
    `select gm.type, gm.achieved_at, gm.description, s.name as skill_name
     from growth_milestones gm join skills s on s.id = gm.skill_id
     where gm.student_id = $1 order by gm.achieved_at desc limit 5`,
    [studentId]
  );

  const recentEvents = await pool.query(
    `select event_type, payload, created_at from technical_growth_events
     where student_id = $1 order by created_at desc limit 10`,
    [studentId]
  );

  res.json({
    studentId,
    overallGrowth:
      overallGrowth === null
        ? { unavailable: true, reason: "No skill has enough comparable, evidence-backed history yet." }
        : { value: overallGrowth, skillsIncluded: available.length },
    skills,
    recentMilestones: recentMilestones.rows,
    recentEvents: recentEvents.rows,
  });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/timeline
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/timeline", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  const events = await pool.query(
    `select tge.id, tge.event_type, tge.payload, tge.created_at, s.name as skill_name
     from technical_growth_events tge
     left join skills s on s.id = tge.skill_id
     where tge.student_id = $1
     order by tge.created_at asc`,
    [studentId]
  );
  res.json({ studentId, events: events.rows });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/skills
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/skills", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  res.json({ studentId, skills: await loadSkillSummaries(studentId) });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/skills/:skillId
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/skills/:skillId", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  const skillId = uuidParam.parse(req.params.skillId);

  const series = await loadSkillSeries(studentId, skillId);
  if (series.length === 0) return res.status(404).json({ error: "NOT_FOUND" });

  const trend = calculatePlateauAwareTrend(series);
  const milestones = await pool.query(
    `select type, achieved_at, description, evidence_ids from growth_milestones
     where student_id = $1 and skill_id = $2 order by achieved_at asc`,
    [studentId, skillId]
  );
  const baseline = await pool.query(
    `select value, confidence, source_type, created_at from technical_baselines
     where student_id = $1 and skill_id = $2 order by created_at desc limit 1`,
    [studentId, skillId]
  );

  res.json({
    studentId,
    skillId,
    series,
    trend,
    baseline: baseline.rows[0] ?? null,
    milestones: milestones.rows,
  });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/snapshots?skillId=
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/snapshots", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  const skillId = req.query.skillId ? uuidParam.parse(req.query.skillId) : undefined;
  const result = await pool.query(
    skillId
      ? `select * from technical_growth_snapshots where student_id=$1 and skill_id=$2 order by observed_at asc`
      : `select * from technical_growth_snapshots where student_id=$1 order by observed_at asc`,
    skillId ? [studentId, skillId] : [studentId]
  );
  res.json({ studentId, snapshots: result.rows });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/milestones
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/milestones", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  const result = await pool.query(
    `select gm.*, s.name as skill_name from growth_milestones gm
     join skills s on s.id = gm.skill_id
     where gm.student_id = $1 order by gm.achieved_at asc`,
    [studentId]
  );
  res.json({ studentId, milestones: result.rows });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/evidence?skillId=
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/evidence", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);
  const skillId = req.query.skillId ? uuidParam.parse(req.query.skillId) : undefined;
  const result = await pool.query(
    skillId
      ? `select * from evidence_submissions where student_id=$1 and skill_id=$2 and invalidated=false order by observed_at desc limit 50`
      : `select * from evidence_submissions where student_id=$1 and invalidated=false order by observed_at desc limit 50`,
    skillId ? [studentId, skillId] : [studentId]
  );
  res.json({ studentId, evidence: result.rows });
});

// ---------------------------------------------------------------------------
// GET /api/students/:studentId/growth/report
// ---------------------------------------------------------------------------
router.get("/students/:studentId/growth/report", requireStudentAccess, async (req, res) => {
  const studentId = uuidParam.parse(req.params.studentId);

  const cached = await pool.query(
    `select * from growth_reports where student_id = $1
     and created_at > now() - interval '1 hour'
     order by created_at desc limit 1`,
    [studentId]
  );
  if ((cached.rowCount ?? 0) > 0) {
    return res.json({ studentId, cached: true, report: cached.rows[0] });
  }

  const skills = await loadSkillSummaries(studentId);
  const milestones = await pool.query(
    `select gm.type, gm.achieved_at, gm.description, s.name as skill_name
     from growth_milestones gm join skills s on s.id = gm.skill_id where gm.student_id = $1 order by gm.achieved_at asc`,
    [studentId]
  );

  const strongest = [...skills]
    .filter((s) => !("unavailable" in s.growth))
    .sort((a, b) => (b.growth as any).absoluteChange - (a.growth as any).absoluteChange)[0];

  let narrative: string | null = null;
  if (strongest) {
    const evidenceCountRes = await pool.query(
      `select count(*)::int as n from evidence_submissions where student_id=$1 and skill_id=$2 and invalidated=false`,
      [studentId, strongest.skillId]
    );
    const transferRes = await pool.query(
      `select exists(select 1 from evidence_submissions where student_id=$1 and skill_id=$2 and is_transfer=true) as has_transfer`,
      [studentId, strongest.skillId]
    );
    const result = await generateGrowthNarrative({
      studentFirstName: "Student",
      skillName: strongest.skillName,
      baseline: strongest.currentValue - (strongest.growth as any).absoluteChange,
      current: strongest.currentValue,
      absoluteChange: (strongest.growth as any).absoluteChange,
      confidence: (strongest.growth as any).confidence,
      evidenceCount: evidenceCountRes.rows[0].n,
      transferEvidence: transferRes.rows[0].has_transfer,
      milestoneDescriptions: milestones.rows
        .filter((m) => m.skill_name === strongest.skillName)
        .map((m) => m.description),
    });
    narrative = result.text;
  }

  const content = { skills, milestones: milestones.rows, generatedAt: new Date().toISOString() };

  const inserted = await pool.query(
    `insert into growth_reports (student_id, period_start, period_end, content_json, ai_narrative)
     values ($1, coalesce((select min(observed_at) from technical_growth_snapshots where student_id=$1), now()), now(), $2, $3)
     returning *`,
    [studentId, JSON.stringify(content), narrative]
  );

  res.json({ studentId, cached: false, report: inserted.rows[0] });
});

// ---------------------------------------------------------------------------
// GET /api/cohorts/:cohortId/growth/overview  (institutional view)
// ---------------------------------------------------------------------------
router.get("/cohorts/:cohortId/growth/overview", requireCohortStaffAccess, async (req: AuthedRequest, res) => {
  const cohortId = uuidParam.parse(req.params.cohortId);

  const students = await pool.query(`select student_id from cohort_students where cohort_id = $1`, [cohortId]);
  const studentIds: string[] = students.rows.map((r) => r.student_id);
  if (studentIds.length === 0) return res.json({ cohortId, studentCount: 0, distribution: {}, bySkill: [] });

  // Distribution buckets — placeholder thresholds. Replace with whatever
  // the existing Mastery system's real bucket definitions are; these are
  // not invented growth-tracking scoring, just a placeholder grouping for
  // display until wired to the authoritative source.
  const latestPerStudent = await pool.query(
    `select distinct on (student_id) student_id, avg_value from (
       select student_id, skill_id, value,
              avg(value) over (partition by student_id) as avg_value,
              observed_at
       from technical_growth_snapshots
       where student_id = any($1)
     ) t
     order by student_id, observed_at desc`,
    [studentIds]
  );

  const buckets = { needsDevelopment: 0, developing: 0, proficient: 0, advanced: 0 };
  for (const row of latestPerStudent.rows) {
    const v = Number(row.avg_value);
    if (v < 40) buckets.needsDevelopment++;
    else if (v < 65) buckets.developing++;
    else if (v < 85) buckets.proficient++;
    else buckets.advanced++;
  }

  const bySkill = await pool.query(
    `select s.name as skill_name, avg(sgm.absolute_change) as avg_change, count(*)::int as n
     from skill_growth_measurements sgm
     join skills s on s.id = sgm.skill_id
     where sgm.student_id = any($1)
     group by s.name
     order by avg_change desc`,
    [studentIds]
  );

  const improving = await pool.query(
    `select count(distinct student_id)::int as n from skill_growth_measurements
     where student_id = any($1) and absolute_change > 5`,
    [studentIds]
  );
  const requiringAttention = await pool.query(
    `select count(distinct student_id)::int as n from skill_growth_measurements
     where student_id = any($1) and absolute_change < -5`,
    [studentIds]
  );

  res.json({
    cohortId,
    studentCount: studentIds.length,
    distribution: buckets,
    bySkill: bySkill.rows.map((r) => ({
      skillName: r.skill_name,
      averageChange: Math.round(Number(r.avg_change) * 10) / 10,
      studentsWithMeasurement: r.n,
    })),
    studentsImproving: improving.rows[0].n,
    studentsRequiringAttention: requiringAttention.rows[0].n,
    studentsStable: studentIds.length - improving.rows[0].n - requiringAttention.rows[0].n,
  });
});
