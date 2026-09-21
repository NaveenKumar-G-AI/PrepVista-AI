import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/client';
import { AppError } from '../domain/errors';
import type {
  DailyPlan,
  EvidenceEvent,
  GapStatus,
  MasteryLevel,
  MilestoneStatus,
  ReadinessState,
  RecalcTrigger,
  RoadmapMilestone,
  RoadmapSkill,
  RoadmapVersion,
  StudentTarget,
  WeeklyPlan,
} from '../domain/types';
import { generateDailyPlan, generateWeeklyPlan } from '../engine/dailyWeeklyPlanner';
import { explainRoadmapSkill } from '../engine/explanationEngine';
import { emptyMasteryState } from '../engine/masteryUpdate';
import { evaluateMilestone, nextMilestoneStatus } from '../engine/milestoneEngine';
import {
  diffRoadmaps,
  matchMilestone,
  type PrevMilestoneSnapshot,
  type PrevSkillSnapshot,
} from '../engine/recalculation';
import { computeReadiness } from '../engine/readinessModel';
import {
  daysBetween,
  generateRoadmapDraft,
  type DraftMilestone,
  type GenerationContext,
} from '../engine/roadmapGenerator';
import { getActiveTarget } from './studentRepo';
import { getAllMasteryStates, getEvidenceForSkill, hasRecentVerificationPass } from './evidenceRepo';
import { getAllPrerequisites, getAllSkills, getRoleCompetencies, skillCategoryMap } from './skillGraphRepo';

function buildGenerationContext(db: Database.Database, studentId: string): { ctx: GenerationContext; target: StudentTarget } {
  const target = getActiveTarget(db, studentId);
  if (!target) throw new AppError('NO_ACTIVE_TARGET', 'Student has no active target profile — set one before generating a roadmap.');
  const allSkills = getAllSkills(db);
  const allPrerequisites = getAllPrerequisites(db);
  const roleCompetencies = getRoleCompetencies(db, target.targetRoleId);
  const masteryStates = getAllMasteryStates(db, studentId);
  return {
    ctx: { studentId, targetDateISO: target.targetDate, allSkills, allPrerequisites, roleCompetencies, masteryStates, now: new Date() },
    target,
  };
}

function emitEvent(db: Database.Database, roadmapId: string, eventType: string, payload: unknown) {
  db.prepare(`INSERT INTO roadmap_events (id, roadmap_id, event_type, payload) VALUES (?, ?, ?, ?)`).run(
    randomUUID(),
    roadmapId,
    eventType,
    JSON.stringify(payload)
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

// --- Persisting a generated draft ------------------------------------------------

interface PersistOptions {
  studentId: string;
  roadmapId: string;
  versionNumber: number;
  trigger: RecalcTrigger;
  reason: string;
  draft: { milestones: DraftMilestone[]; excludedCycleSkillIds: string[] };
  prevMilestones: PrevMilestoneSnapshot[];
  diff: ReturnType<typeof diffRoadmaps>['diff'] | null;
}

function persistVersion(db: Database.Database, opts: PersistOptions): string {
  const versionId = randomUUID();
  db.prepare(
    `INSERT INTO roadmap_versions (id, roadmap_id, version_number, trigger, reason, is_current, diff_json)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).run(versionId, opts.roadmapId, opts.versionNumber, opts.trigger, opts.reason, opts.diff ? JSON.stringify(opts.diff) : null);

  let previousMilestoneId: string | null = null;
  let previousMilestoneCompleted = true; // first milestone has no prerequisite milestone

  for (const dm of opts.draft.milestones) {
    const milestoneId = randomUUID();
    const skillIds = dm.skills.map((s) => s.skillId);
    const matched = matchMilestone(skillIds, opts.prevMilestones);
    const prereqIds = previousMilestoneId ? [previousMilestoneId] : [];

    const evidenceBySkill = new Map<string, EvidenceEvent[]>();
    for (const ds of dm.skills) evidenceBySkill.set(ds.skillId, getEvidenceForSkill(db, opts.studentId, ds.skillId));

    const roadmapSkillsForEval: RoadmapSkill[] = dm.skills.map((ds) => ({
      id: '',
      roadmapMilestoneId: milestoneId,
      skillId: ds.skillId,
      skillName: ds.skillName,
      required: ds.required,
      priorityScore: ds.priorityScore,
      priorityBreakdown: ds.priorityBreakdown,
      gapStatus: ds.gapStatus,
      targetMastery: ds.targetMastery,
      currentMasterySnapshot: ds.currentMasterySnapshot,
      activityType: ds.activityType,
      learningObjective: ds.learningObjective,
      sequence: ds.sequence,
      insertedReason: ds.insertedReason,
    }));

    const evaluation = evaluateMilestone(roadmapSkillsForEval, dm.completionConditions, evidenceBySkill);
    const skillSetChanged = matched ? !sameSet(matched.skillIds, skillIds) : true;
    const currentStatus: MilestoneStatus = (matched?.status as MilestoneStatus) ?? 'LOCKED';
    const status = nextMilestoneStatus(currentStatus, previousMilestoneCompleted, evaluation, skillSetChanged);

    db.prepare(
      `INSERT INTO roadmap_milestones (id, roadmap_version_id, sequence, name, description, status, prerequisite_milestone_ids, completion_conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(milestoneId, versionId, dm.sequence, dm.name, dm.description, status, JSON.stringify(prereqIds), JSON.stringify(dm.completionConditions));

    for (const ds of dm.skills) {
      db.prepare(
        `INSERT INTO roadmap_skills (id, roadmap_milestone_id, skill_id, required, priority_score, priority_breakdown, gap_status, target_mastery, current_mastery_snapshot, activity_type, learning_objective, sequence, inserted_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        milestoneId,
        ds.skillId,
        ds.required ? 1 : 0,
        ds.priorityScore,
        JSON.stringify(ds.priorityBreakdown),
        ds.gapStatus,
        ds.targetMastery,
        ds.currentMasterySnapshot,
        ds.activityType,
        ds.learningObjective,
        ds.sequence,
        ds.insertedReason
      );
    }

    previousMilestoneId = milestoneId;
    previousMilestoneCompleted = status === 'COMPLETED';
  }

  return versionId;
}

function computeAtRisk(milestones: DraftMilestone[], dailyMinutes: number, daysRemaining: number | null): boolean {
  if (daysRemaining === null) return false;
  const unitsByStatus: Partial<Record<GapStatus, number>> = {
    CRITICAL_GAP: 150,
    GAP: 100,
    UNKNOWN: 80,
    DEVELOPING: 50,
    INSUFFICIENT_EVIDENCE: 40,
  };
  const remaining = milestones.flatMap((m) => m.skills).filter((s) => s.gapStatus !== 'COMPLETE' && s.gapStatus !== 'BLOCKED');
  const estimatedMinutesNeeded = remaining.reduce((sum, s) => sum + (unitsByStatus[s.gapStatus] ?? 60), 0);
  const availableMinutes = Math.max(0, daysRemaining) * dailyMinutes;
  return availableMinutes < estimatedMinutesNeeded;
}

function finalizeReadiness(
  db: Database.Database,
  roadmapId: string,
  versionId: string,
  ctx: GenerationContext,
  target: StudentTarget,
  draftMilestones: DraftMilestone[],
  prevReadinessState?: ReadinessState | null
) {
  const skillCategory = skillCategoryMap(ctx.allSkills);
  const recentVerification = hasRecentVerificationPass(db, ctx.studentId);
  const readiness = computeReadiness(ctx.roleCompetencies, ctx.masteryStates, skillCategory, target.targetState, recentVerification);
  const daysRemaining = ctx.targetDateISO ? daysBetween(ctx.now, new Date(ctx.targetDateISO)) : null;
  const atRisk = computeAtRisk(draftMilestones, target.dailyMinutes, daysRemaining);

  db.prepare(`UPDATE roadmap_versions SET readiness_state = ?, readiness_score = ?, at_risk = ? WHERE id = ?`).run(
    readiness.state,
    readiness.overallScore,
    atRisk ? 1 : 0,
    versionId
  );

  if (prevReadinessState !== undefined && prevReadinessState !== readiness.state) {
    emitEvent(db, roadmapId, 'READINESS_CHANGED', { from: prevReadinessState, to: readiness.state, score: readiness.overallScore });
  }
  return readiness;
}

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

function regeneratePlans(db: Database.Database, studentId: string, versionId: string, dailyMinutes: number) {
  const version = assembleVersion(db, versionId);
  const actionable = version.milestones.flatMap((m) => m.skills).filter((s) => s.gapStatus !== 'COMPLETE' && s.gapStatus !== 'BLOCKED');

  const today = new Date().toISOString().slice(0, 10);
  const dailyPlan = generateDailyPlan(today, actionable, dailyMinutes);
  db.prepare(
    `INSERT INTO daily_plans (id, student_id, roadmap_version_id, plan_date, blocks, primary_action) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, plan_date) DO UPDATE SET roadmap_version_id=excluded.roadmap_version_id, blocks=excluded.blocks, primary_action=excluded.primary_action, generated_at=datetime('now')`
  ).run(randomUUID(), studentId, versionId, today, JSON.stringify(dailyPlan.blocks), dailyPlan.primaryAction);

  const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);
  const weeklyPlan = generateWeeklyPlan(weekStart, actionable);
  db.prepare(
    `INSERT INTO weekly_plans (id, student_id, roadmap_version_id, week_start, objective, required_evidence) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, week_start) DO UPDATE SET roadmap_version_id=excluded.roadmap_version_id, objective=excluded.objective, required_evidence=excluded.required_evidence, generated_at=datetime('now')`
  ).run(randomUUID(), studentId, versionId, weekStart, weeklyPlan.objective, JSON.stringify(weeklyPlan.requiredEvidence));
}

// --- Assembly (DB rows -> domain objects) -----------------------------------------

function assembleVersion(db: Database.Database, versionId: string): RoadmapVersion {
  const v = db
    .prepare(
      `SELECT id, roadmap_id, version_number, trigger, reason, is_current, readiness_state, readiness_score, at_risk, diff_json, created_at
       FROM roadmap_versions WHERE id = ?`
    )
    .get(versionId) as Record<string, unknown>;

  const milestoneRows = db
    .prepare(
      `SELECT id, sequence, name, description, status, prerequisite_milestone_ids, completion_conditions
       FROM roadmap_milestones WHERE roadmap_version_id = ? ORDER BY sequence ASC`
    )
    .all(versionId) as Array<Record<string, unknown>>;

  const milestones: RoadmapMilestone[] = milestoneRows.map((m) => {
    const skillRows = db
      .prepare(
        `SELECT rs.*, sk.name as skill_name FROM roadmap_skills rs JOIN skills sk ON sk.id = rs.skill_id
         WHERE rs.roadmap_milestone_id = ? ORDER BY rs.sequence ASC`
      )
      .all(m.id as string) as Array<Record<string, unknown>>;

    const skills: RoadmapSkill[] = skillRows.map((s) => ({
      id: s.id as string,
      roadmapMilestoneId: s.roadmap_milestone_id as string,
      skillId: s.skill_id as string,
      skillName: s.skill_name as string,
      required: s.required === 1,
      priorityScore: s.priority_score as number,
      priorityBreakdown: JSON.parse(s.priority_breakdown as string),
      gapStatus: s.gap_status as GapStatus,
      targetMastery: s.target_mastery as MasteryLevel,
      currentMasterySnapshot: s.current_mastery_snapshot as MasteryLevel | null,
      activityType: s.activity_type as RoadmapSkill['activityType'],
      learningObjective: s.learning_objective as string,
      sequence: s.sequence as number,
      insertedReason: s.inserted_reason as string | null,
    }));

    return {
      id: m.id as string,
      roadmapVersionId: versionId,
      sequence: m.sequence as number,
      name: m.name as string,
      description: m.description as string,
      status: m.status as MilestoneStatus,
      prerequisiteMilestoneIds: JSON.parse(m.prerequisite_milestone_ids as string),
      completionConditions: JSON.parse(m.completion_conditions as string),
      skills,
    };
  });

  return {
    id: v.id as string,
    roadmapId: v.roadmap_id as string,
    versionNumber: v.version_number as number,
    trigger: v.trigger as RecalcTrigger,
    reason: v.reason as string,
    isCurrent: v.is_current === 1,
    readinessState: (v.readiness_state as ReadinessState | null) ?? null,
    readinessScore: (v.readiness_score as number | null) ?? null,
    atRisk: v.at_risk === 1,
    diff: v.diff_json ? JSON.parse(v.diff_json as string) : null,
    createdAt: v.created_at as string,
    milestones,
  };
}

export function getActiveRoadmapVersion(db: Database.Database, studentId: string): RoadmapVersion | undefined {
  const roadmap = db.prepare(`SELECT id, current_version_id FROM roadmaps WHERE student_id = ? AND status = 'ACTIVE'`).get(studentId) as
    | { id: string; current_version_id: string | null }
    | undefined;
  if (!roadmap || !roadmap.current_version_id) return undefined;
  return assembleVersion(db, roadmap.current_version_id);
}

// --- Public API ---------------------------------------------------------------

/** Idempotent (Phase 51): returns the existing active roadmap unchanged if one exists. */
export function generateOrGetRoadmap(db: Database.Database, studentId: string): RoadmapVersion {
  const existing = getActiveRoadmapVersion(db, studentId);
  if (existing) return existing;

  const { ctx, target } = buildGenerationContext(db, studentId);
  const draft = generateRoadmapDraft(ctx);

  return withTransaction(db, () => {
    const roadmapId = randomUUID();
    db.prepare(`INSERT INTO roadmaps (id, student_id, status, current_version_id) VALUES (?, ?, 'ACTIVE', NULL)`).run(roadmapId, studentId);

    const versionId = persistVersion(db, {
      studentId,
      roadmapId,
      versionNumber: 1,
      trigger: 'INITIAL',
      reason: 'Initial roadmap generated from role blueprint and current evidence.',
      draft,
      prevMilestones: [],
      diff: null,
    });

    finalizeReadiness(db, roadmapId, versionId, ctx, target, draft.milestones);
    db.prepare(`UPDATE roadmaps SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(versionId, roadmapId);

    emitEvent(db, roadmapId, 'ROADMAP_CREATED', { versionNumber: 1, milestoneCount: draft.milestones.length });
    if (draft.excludedCycleSkillIds.length > 0) {
      emitEvent(db, roadmapId, 'INVALID_SKILL_GRAPH_DETECTED', { excludedSkillIds: draft.excludedCycleSkillIds });
    }

    regeneratePlans(db, studentId, versionId, target.dailyMinutes);
    return assembleVersion(db, versionId);
  });
}

/**
 * Recalculates only if the fresh draft is materially different from the
 * current version (Phase 21). Milestone statuses are carried forward via
 * best-match, so a recalculation triggered by one skill's evidence doesn't
 * reset unrelated in-progress milestones.
 */
export function recalculate(
  db: Database.Database,
  studentId: string,
  trigger: RecalcTrigger,
  reasonOverride?: string
): { changed: boolean; version: RoadmapVersion } {
  const roadmapRow = db.prepare(`SELECT id, current_version_id FROM roadmaps WHERE student_id = ? AND status = 'ACTIVE'`).get(studentId) as
    | { id: string; current_version_id: string | null }
    | undefined;

  if (!roadmapRow || !roadmapRow.current_version_id) {
    return { changed: true, version: generateOrGetRoadmap(db, studentId) };
  }

  const { ctx, target } = buildGenerationContext(db, studentId);
  const draft = generateRoadmapDraft(ctx);
  const prevVersion = assembleVersion(db, roadmapRow.current_version_id);

  const prevSkillSnapshots: PrevSkillSnapshot[] = prevVersion.milestones.flatMap((m) =>
    m.skills.map((s) => ({ skillId: s.skillId, skillName: s.skillName, gapStatus: s.gapStatus }))
  );
  const { materialChange, diff } = diffRoadmaps(prevSkillSnapshots, draft.milestones);

  if (!materialChange) {
    return { changed: false, version: prevVersion };
  }

  const prevMilestoneSnapshots: PrevMilestoneSnapshot[] = prevVersion.milestones.map((m) => ({
    id: m.id,
    status: m.status,
    skillIds: m.skills.map((s) => s.skillId),
  }));

  return withTransaction(db, () => {
    db.prepare(`UPDATE roadmap_versions SET is_current = 0 WHERE id = ?`).run(prevVersion.id);
    const nextVersionNumber = prevVersion.versionNumber + 1;

    const versionId = persistVersion(db, {
      studentId,
      roadmapId: roadmapRow.id,
      versionNumber: nextVersionNumber,
      trigger,
      reason: reasonOverride ?? diff.summary,
      draft,
      prevMilestones: prevMilestoneSnapshots,
      diff,
    });

    finalizeReadiness(db, roadmapRow.id, versionId, ctx, target, draft.milestones, prevVersion.readinessState);
    db.prepare(`UPDATE roadmaps SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(versionId, roadmapRow.id);

    emitEvent(db, roadmapRow.id, 'ROADMAP_RECALCULATED', { versionNumber: nextVersionNumber, trigger, diff });
    for (const s of diff.skillsInserted) {
      emitEvent(db, roadmapRow.id, /prerequisite/i.test(s.reason) ? 'PREREQUISITE_INSERTED' : 'SKILL_ADDED', s);
    }
    for (const s of diff.skillsCompleted) emitEvent(db, roadmapRow.id, 'SKILL_COMPLETED', s);

    const newVersion = assembleVersion(db, versionId);
    for (const m of newVersion.milestones) {
      if (m.status === 'COMPLETED') emitEvent(db, roadmapRow.id, 'MILESTONE_COMPLETED', { milestoneId: m.id, name: m.name });
    }

    regeneratePlans(db, studentId, versionId, target.dailyMinutes);
    return { changed: true, version: newVersion };
  });
}

export function getRoadmapVersionsSummary(db: Database.Database, studentId: string) {
  const roadmapRow = db.prepare(`SELECT id FROM roadmaps WHERE student_id = ? AND status = 'ACTIVE'`).get(studentId) as { id: string } | undefined;
  if (!roadmapRow) return [];
  const rows = db
    .prepare(
      `SELECT id, version_number, trigger, reason, is_current, readiness_state, readiness_score, at_risk, created_at
       FROM roadmap_versions WHERE roadmap_id = ? ORDER BY version_number ASC`
    )
    .all(roadmapRow.id) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id,
    versionNumber: r.version_number,
    trigger: r.trigger,
    reason: r.reason,
    isCurrent: r.is_current === 1,
    readinessState: r.readiness_state,
    readinessScore: r.readiness_score,
    atRisk: r.at_risk === 1,
    createdAt: r.created_at,
  }));
}

export function getDailyPlan(db: Database.Database, studentId: string, dateISO?: string): DailyPlan | undefined {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const row = db.prepare(`SELECT plan_date, blocks, primary_action FROM daily_plans WHERE student_id = ? AND plan_date = ?`).get(studentId, date) as
    | { plan_date: string; blocks: string; primary_action: string }
    | undefined;
  if (!row) return undefined;
  return { planDate: row.plan_date, primaryAction: row.primary_action, blocks: JSON.parse(row.blocks) };
}

export function getWeeklyPlan(db: Database.Database, studentId: string, weekStartISO?: string): WeeklyPlan | undefined {
  const weekStart = weekStartISO ?? mondayOf(new Date()).toISOString().slice(0, 10);
  const row = db.prepare(`SELECT week_start, objective, required_evidence FROM weekly_plans WHERE student_id = ? AND week_start = ?`).get(studentId, weekStart) as
    | { week_start: string; objective: string; required_evidence: string }
    | undefined;
  if (!row) return undefined;
  return { weekStart: row.week_start, objective: row.objective, requiredEvidence: JSON.parse(row.required_evidence) };
}

export interface SkillDetail {
  skillId: string;
  skillName: string;
  category: string;
  masteryLevel: MasteryLevel | null;
  confidence: number;
  evidenceCount: number;
  trend: string | null;
  targetMastery: MasteryLevel | null;
  gapStatus: GapStatus | null;
  prerequisites: string[];
  roadmapPosition: { milestoneName: string; sequence: number } | null;
  recommendedNextAction: string | null;
  verificationStatus: 'PASSED' | 'PENDING' | 'NOT_ATTEMPTED';
  recentEvidence: EvidenceEvent[];
}

export function getSkillDetail(db: Database.Database, studentId: string, skillId: string): SkillDetail | undefined {
  const skill = db.prepare(`SELECT id, name, category FROM skills WHERE id = ?`).get(skillId) as { id: string; name: string; category: string } | undefined;
  if (!skill) return undefined;

  const masteryState = getAllMasteryStates(db, studentId).get(skillId) ?? emptyMasteryState(studentId, skillId);
  const prereqRows = db
    .prepare(
      `SELECT s.name FROM skill_prerequisites sp JOIN skills s ON s.id = sp.prerequisite_skill_id
       WHERE sp.skill_id = ? AND sp.relationship_type = 'PREREQUISITE'`
    )
    .all(skillId) as Array<{ name: string }>;

  const version = getActiveRoadmapVersion(db, studentId);
  let roadmapSkill: RoadmapSkill | undefined;
  let milestoneName: string | undefined;
  let sequence: number | undefined;
  if (version) {
    for (const m of version.milestones) {
      const found = m.skills.find((s) => s.skillId === skillId);
      if (found) {
        roadmapSkill = found;
        milestoneName = m.name;
        sequence = m.sequence;
        break;
      }
    }
  }

  const evidence = getEvidenceForSkill(db, studentId, skillId);
  const verificationStatus: SkillDetail['verificationStatus'] = evidence.some(
    (e) => e.source === 'VERIFICATION' && e.independent && e.outcome === 'SUCCESS'
  )
    ? 'PASSED'
    : evidence.some((e) => e.source === 'VERIFICATION')
      ? 'PENDING'
      : 'NOT_ATTEMPTED';

  return {
    skillId,
    skillName: skill.name,
    category: skill.category,
    masteryLevel: masteryState.masteryLevel,
    confidence: masteryState.confidence,
    evidenceCount: masteryState.evidenceCount,
    trend: masteryState.trend,
    targetMastery: roadmapSkill?.targetMastery ?? null,
    gapStatus: roadmapSkill?.gapStatus ?? null,
    prerequisites: prereqRows.map((r) => r.name),
    roadmapPosition: milestoneName ? { milestoneName, sequence: sequence as number } : null,
    recommendedNextAction: roadmapSkill ? `${roadmapSkill.activityType}: ${roadmapSkill.learningObjective}` : null,
    verificationStatus,
    recentEvidence: evidence.slice(-5).reverse(),
  };
}

export function explainRoadmapSkillById(db: Database.Database, roadmapSkillId: string): string | undefined {
  const row = db
    .prepare(
      `SELECT rs.*, sk.name as skill_name FROM roadmap_skills rs JOIN skills sk ON sk.id = rs.skill_id WHERE rs.id = ?`
    )
    .get(roadmapSkillId) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  const skill: RoadmapSkill = {
    id: row.id as string,
    roadmapMilestoneId: row.roadmap_milestone_id as string,
    skillId: row.skill_id as string,
    skillName: row.skill_name as string,
    required: row.required === 1,
    priorityScore: row.priority_score as number,
    priorityBreakdown: JSON.parse(row.priority_breakdown as string),
    gapStatus: row.gap_status as GapStatus,
    targetMastery: row.target_mastery as MasteryLevel,
    currentMasterySnapshot: row.current_mastery_snapshot as MasteryLevel | null,
    activityType: row.activity_type as RoadmapSkill['activityType'],
    learningObjective: row.learning_objective as string,
    sequence: row.sequence as number,
    insertedReason: row.inserted_reason as string | null,
  };

  const dependentNames = (
    db
      .prepare(
        `SELECT DISTINCT s2.name as name FROM skill_prerequisites sp JOIN skills s2 ON s2.id = sp.skill_id
         WHERE sp.prerequisite_skill_id = ? AND sp.relationship_type = 'PREREQUISITE'`
      )
      .all(skill.skillId) as Array<{ name: string }>
  ).map((r) => r.name);

  return explainRoadmapSkill(skill, dependentNames);
}

export function getEvents(db: Database.Database, studentId: string): Array<{ eventType: string; payload: unknown; createdAt: string }> {
  const roadmapRow = db.prepare(`SELECT id FROM roadmaps WHERE student_id = ? AND status = 'ACTIVE'`).get(studentId) as { id: string } | undefined;
  if (!roadmapRow) return [];
  const rows = db.prepare(`SELECT event_type, payload, created_at FROM roadmap_events WHERE roadmap_id = ? ORDER BY created_at ASC`).all(roadmapRow.id) as Array<{
    event_type: string;
    payload: string;
    created_at: string;
  }>;
  return rows.map((r) => ({ eventType: r.event_type, payload: JSON.parse(r.payload), createdAt: r.created_at }));
}

export function cohortSummary(db: Database.Database, cohortId: string) {
  const students = db.prepare(`SELECT id FROM students WHERE cohort_id = ?`).all(cohortId) as Array<{ id: string }>;
  const total = students.length;
  if (total === 0) return { cohortId, studentCount: 0, skillCoverage: [] as Array<{ skillName: string; percentAtTarget: number }> };

  const placeholders = students.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT sk.name as skill_name, sms.mastery_level as mastery_level, sms.student_id as student_id
       FROM skill_mastery_state sms JOIN skills sk ON sk.id = sms.skill_id
       WHERE sms.student_id IN (${placeholders})`
    )
    .all(...students.map((s) => s.id)) as Array<{ skill_name: string; mastery_level: string | null; student_id: string }>;

  const bySkill = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!bySkill.has(r.skill_name)) bySkill.set(r.skill_name, new Set());
    if (r.mastery_level && ['COMPETENT', 'STRONG', 'MASTERED'].includes(r.mastery_level)) {
      bySkill.get(r.skill_name)!.add(r.student_id);
    }
  }

  const skillCoverage = Array.from(bySkill.entries())
    .map(([skillName, atTarget]) => ({ skillName, percentAtTarget: Math.round((atTarget.size / total) * 100) }))
    .sort((a, b) => a.percentAtTarget - b.percentAtTarget);

  return { cohortId, studentCount: total, skillCoverage };
}
