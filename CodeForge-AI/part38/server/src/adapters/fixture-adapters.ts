import { all, one } from "../db/database";
import {
  EvidenceState,
  EvidenceStrength,
  MasteryLevel,
  RoleReadinessLevel,
  SkillTrend,
  UserRole,
} from "../domain/enums";
import type {
  AuthenticatedUser,
  CodingEvidencePort,
  CodingPerformanceRaw,
  DataVersionPort,
  DebuggingEvidenceRaw,
  GrowthEventRaw,
  GrowthInsightsRaw,
  GrowthTrackingPort,
  IdentityPort,
  InterviewEvidencePort,
  InterviewEvidenceRaw,
  MasterySystemPort,
  NextBestActionPort,
  NextBestActionRaw,
  OrganizationRecord,
  ProjectEvidencePort,
  ProjectEvidenceRaw,
  ReasoningEvidenceRaw,
  RoleReadinessPort,
  RoleReadinessRaw,
  SkillGapPort,
  SkillGapRaw,
  SkillMasteryEntryRaw,
  StudentRecord,
} from "../ports";

/**
 * ############################################################################
 * STUB ADAPTERS — replace before production use.
 *
 * Every class below implements a port from src/ports by reading a
 * fixture_* table. They exist ONLY so Feature 38 is runnable and testable
 * in isolation, per brief §87 ("if [the referenced subsystem] does not
 * exist: inspect alternatives, determine the actual architecture,
 * implement only what is necessary, document the decision"). In the real
 * CodeForge repo, none of these classes should ship — write one adapter
 * file per real service (Skill Signal Engine, Role Readiness Engine, etc.)
 * implementing the same interfaces, and wire it in src/http/app.ts instead
 * of this file. No collector/assembler/service code changes.
 * ############################################################################
 */

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class FixtureIdentityAdapter implements IdentityPort {
  async getStudent(studentId: string): Promise<StudentRecord | null> {
    const row = one<{ id: string; org_id: string; name: string }>(
      `SELECT id, org_id, name FROM fixture_student WHERE id = ?`,
      [studentId],
    );
    if (!row) return null;
    const roles = all<{ role_id: string }>(
      `SELECT role_id FROM fixture_student_target_role WHERE student_id = ?`,
      [studentId],
    );
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      targetRoleIds: roles.map((r) => r.role_id),
    };
  }

  async getOrganization(orgId: string): Promise<OrganizationRecord | null> {
    const row = one<{ id: string; name: string }>(
      `SELECT id, name FROM fixture_organization WHERE id = ?`,
      [orgId],
    );
    return row ? { id: row.id, name: row.name } : null;
  }

  async canUserAccessStudent(user: AuthenticatedUser, studentId: string): Promise<boolean> {
    const student = await this.getStudent(studentId);
    if (!student) return false;
    if (student.orgId !== user.orgId) return false; // tenant isolation, brief §47

    switch (user.role) {
      case UserRole.STUDENT:
        return user.studentId === studentId;
      case UserRole.TRAINER: {
        const link = one(
          `SELECT 1 as x FROM fixture_trainer_student WHERE trainer_id = ? AND student_id = ?`,
          [user.id, studentId],
        );
        return link !== null;
      }
      case UserRole.TPO:
      case UserRole.INSTITUTION_ADMIN:
        // Placement teams and institution admins see any student in their own org.
        return true;
      case UserRole.ADMIN:
        // Platform admin: operational access only (brief §5). Content access is
        // denied here deliberately — see access-control.ts for the split between
        // "can see this report exists / its status" and "can see its content."
        return false;
      default:
        return false;
    }
  }
}

export class FixtureDataVersionAdapter implements DataVersionPort {
  async getCurrentSourceDataVersion(studentId: string): Promise<number> {
    const row = one<{ version: number }>(
      `SELECT version FROM fixture_data_version WHERE student_id = ?`,
      [studentId],
    );
    return row?.version ?? 1;
  }
}

export class FixtureMasterySystemAdapter implements MasterySystemPort {
  async getOverallMastery(studentId: string): Promise<MasteryLevel | null> {
    const skills = await this.getSkillMasteryMap(studentId);
    if (skills.length === 0) return null;
    // Presentational only: "overall" here is the fixture's own aggregate field
    // when present, else the median-ish skill level. In production this value
    // comes directly from the real Mastery Level System's own overall score —
    // this fallback exists only because no such aggregate exists in the fixture.
    const order = [
      MasteryLevel.FOUNDATIONAL,
      MasteryLevel.DEVELOPING,
      MasteryLevel.COMPETENT,
      MasteryLevel.PROFICIENT,
      MasteryLevel.ADVANCED,
      MasteryLevel.EXPERT,
    ];
    const indices = skills.map((s) => order.indexOf(s.masteryLevel)).sort((a, b) => a - b);
    const mid = indices[Math.floor(indices.length / 2)] ?? 0;
    return order[mid] ?? null;
  }

  async getSkillMasteryMap(studentId: string): Promise<SkillMasteryEntryRaw[]> {
    const rows = all<{
      skill_id: string;
      skill_name: string;
      mastery_level: string;
      trend: string;
      evidence_strength: string;
      evidence_count: number;
      last_evaluated_at: string;
      role_relevance: string;
    }>(
      `SELECT s.skill_id, sk.name AS skill_name, s.mastery_level, s.trend,
              s.evidence_strength, s.evidence_count, s.last_evaluated_at, s.role_relevance
       FROM fixture_student_skill_state s
       JOIN fixture_skill sk ON sk.id = s.skill_id
       WHERE s.student_id = ?
       ORDER BY sk.name`,
      [studentId],
    );
    return rows.map((r) => ({
      skillId: r.skill_id,
      skillName: r.skill_name,
      masteryLevel: r.mastery_level as MasteryLevel,
      trend: r.trend as SkillTrend,
      evidenceStrength: r.evidence_strength as EvidenceStrength,
      evidenceCount: r.evidence_count,
      lastEvaluatedAt: r.last_evaluated_at,
      roleRelevance: parseJsonArray(r.role_relevance),
    }));
  }
}

export class FixtureRoleReadinessAdapter implements RoleReadinessPort {
  async getTargetRoles(studentId: string): Promise<{ id: string; name: string }[]> {
    const rows = all<{ id: string; name: string }>(
      `SELECT r.id, r.name FROM fixture_student_target_role tr
       JOIN fixture_role r ON r.id = tr.role_id
       WHERE tr.student_id = ?
       ORDER BY r.name`,
      [studentId],
    );
    return rows;
  }

  async getRoleReadiness(studentId: string, roleId: string): Promise<RoleReadinessRaw | null> {
    const row = one<{
      role_id: string;
      role_name: string;
      readiness: string;
      ready_areas: string;
      developing_areas: string;
      blocking_gaps: string;
    }>(
      `SELECT rr.role_id, r.name AS role_name, rr.readiness, rr.ready_areas,
              rr.developing_areas, rr.blocking_gaps
       FROM fixture_role_readiness rr
       JOIN fixture_role r ON r.id = rr.role_id
       WHERE rr.student_id = ? AND rr.role_id = ?`,
      [studentId, roleId],
    );
    if (!row) return null;
    return {
      roleId: row.role_id,
      roleName: row.role_name,
      readiness: row.readiness as RoleReadinessLevel,
      readyAreas: parseJsonArray(row.ready_areas),
      developingAreas: parseJsonArray(row.developing_areas),
      blockingGaps: parseJsonArray(row.blocking_gaps),
    };
  }
}

export class FixtureSkillGapAdapter implements SkillGapPort {
  async getRoleSkillGaps(studentId: string, roleId: string): Promise<SkillGapRaw[]> {
    const rows = all<{
      skill_id: string;
      skill_name: string;
      role_id: string;
      role_name: string;
      current_state: string;
      expected_state: string;
      gap: string;
      evidence_refs: string;
      role_impact: string;
      recommended_action: string;
    }>(
      `SELECT g.skill_id, sk.name AS skill_name, g.role_id, r.name AS role_name,
              g.current_state, g.expected_state, g.gap, g.evidence_refs,
              g.role_impact, g.recommended_action
       FROM fixture_skill_gap g
       JOIN fixture_skill sk ON sk.id = g.skill_id
       JOIN fixture_role r ON r.id = g.role_id
       WHERE g.student_id = ? AND g.role_id = ?`,
      [studentId, roleId],
    );
    return rows.map((r) => ({
      skillId: r.skill_id,
      skillName: r.skill_name,
      roleId: r.role_id,
      roleName: r.role_name,
      currentState: r.current_state as MasteryLevel,
      expectedState: r.expected_state as MasteryLevel,
      gap: r.gap,
      evidenceRefs: parseJsonArray(r.evidence_refs),
      roleImpact: r.role_impact,
      recommendedAction: r.recommended_action,
    }));
  }
}

export class FixtureGrowthTrackingAdapter implements GrowthTrackingPort {
  async getGrowthTimeline(studentId: string): Promise<GrowthEventRaw[]> {
    const rows = all<{
      skill_name: string;
      occurred_at: string;
      from_level: string;
      to_level: string;
      note: string | null;
    }>(
      `SELECT sk.name AS skill_name, e.occurred_at, e.from_level, e.to_level, e.note
       FROM fixture_growth_event e
       JOIN fixture_skill sk ON sk.id = e.skill_id
       WHERE e.student_id = ?
       ORDER BY e.occurred_at ASC`,
      [studentId],
    );
    return rows.map((r) => ({
      skillName: r.skill_name,
      occurredAt: r.occurred_at,
      fromLevel: r.from_level as MasteryLevel,
      toLevel: r.to_level as MasteryLevel,
      note: r.note,
    }));
  }

  async getGrowthInsights(studentId: string): Promise<GrowthInsightsRaw> {
    const timeline = await this.getGrowthTimeline(studentId);
    // Fixture heuristic standing in for real growth analytics: fewer than 2
    // recorded events isn't enough to characterize a trend (brief §32:
    // "avoid misleading growth conclusions when the dataset is sparse").
    if (timeline.length < 2) {
      return {
        fastestImproving: [],
        stable: [],
        persistentGaps: [],
        recentlyImproved: timeline.map((e) => e.skillName),
        insufficientData: true,
      };
    }
    const recentCutoffDays = 30;
    const now = Date.now();
    const recentlyImproved = timeline
      .filter((e) => (now - new Date(e.occurredAt).getTime()) / 86_400_000 <= recentCutoffDays)
      .map((e) => e.skillName);
    const bySkill = new Map<string, GrowthEventRaw[]>();
    for (const e of timeline) {
      const list = bySkill.get(e.skillName) ?? [];
      list.push(e);
      bySkill.set(e.skillName, list);
    }
    const fastestImproving = [...bySkill.entries()]
      .filter(([, events]) => events.length >= 2)
      .map(([skill]) => skill);
    return {
      fastestImproving,
      stable: [],
      persistentGaps: [],
      recentlyImproved: [...new Set(recentlyImproved)],
      insufficientData: false,
    };
  }
}

export class FixtureNextBestActionAdapter implements NextBestActionPort {
  async getNextBestActions(studentId: string): Promise<NextBestActionRaw[]> {
    const rows = all<{
      action: string;
      why: string;
      related_skill_id: string | null;
      role_impact: string | null;
      priority: number;
    }>(
      `SELECT n.action, n.why, n.related_skill_id, n.role_impact, n.priority
       FROM fixture_next_best_action n
       WHERE n.student_id = ?
       ORDER BY n.priority ASC`,
      [studentId],
    );
    const skillNameCache = new Map<string, string>();
    const results: NextBestActionRaw[] = [];
    for (const r of rows) {
      let relatedSkill: string | null = null;
      if (r.related_skill_id) {
        if (!skillNameCache.has(r.related_skill_id)) {
          const s = one<{ name: string }>(`SELECT name FROM fixture_skill WHERE id = ?`, [
            r.related_skill_id,
          ]);
          skillNameCache.set(r.related_skill_id, s?.name ?? r.related_skill_id);
        }
        relatedSkill = skillNameCache.get(r.related_skill_id) ?? null;
      }
      results.push({
        action: r.action,
        why: r.why,
        relatedSkill,
        roleImpact: r.role_impact,
        priority: r.priority,
      });
    }
    return results;
  }
}

export class FixtureCodingEvidenceAdapter implements CodingEvidencePort {
  async getCodingPerformance(studentId: string): Promise<CodingPerformanceRaw | null> {
    const row = one<{
      correctness: string | null;
      efficiency: string | null;
      complexity: string | null;
      code_quality: string | null;
      problem_solving: string | null;
      evidence_state: string;
      sample_count: number;
      last_evaluated_at: string | null;
    }>(
      `SELECT correctness, efficiency, complexity, code_quality, problem_solving,
              evidence_state, sample_count, last_evaluated_at
       FROM fixture_coding_evidence WHERE student_id = ?`,
      [studentId],
    );
    if (!row) return null;
    return {
      correctness: row.correctness,
      efficiency: row.efficiency,
      complexity: row.complexity,
      codeQuality: row.code_quality,
      problemSolving: row.problem_solving,
      evidenceState: row.evidence_state as EvidenceState,
      sampleCount: row.sample_count,
      lastEvaluatedAt: row.last_evaluated_at,
    };
  }

  async getDebuggingEvidence(studentId: string): Promise<DebuggingEvidenceRaw | null> {
    const row = one<{
      debugging_capability: string | null;
      debugging_weakness: string | null;
      debugging_trend: string | null;
      evidence_state: string;
    }>(
      `SELECT debugging_capability, debugging_weakness, debugging_trend, evidence_state
       FROM fixture_coding_evidence WHERE student_id = ?`,
      [studentId],
    );
    if (!row || !row.debugging_capability) return null;
    return {
      capability: row.debugging_capability,
      commonWeakness: row.debugging_weakness,
      trend: (row.debugging_trend as SkillTrend) ?? null,
      evidenceState: row.evidence_state as EvidenceState,
    };
  }

  async getReasoningEvidence(studentId: string): Promise<ReasoningEvidenceRaw | null> {
    const row = one<{
      reasoning_note: string | null;
      understanding_note: string | null;
      evidence_state: string;
    }>(
      `SELECT reasoning_note, understanding_note, evidence_state
       FROM fixture_coding_evidence WHERE student_id = ?`,
      [studentId],
    );
    if (!row || (!row.reasoning_note && !row.understanding_note)) return null;
    return {
      reasoningNote: row.reasoning_note,
      understandingNote: row.understanding_note,
      evidenceState: row.evidence_state as EvidenceState,
    };
  }
}

export class FixtureProjectEvidenceAdapter implements ProjectEvidencePort {
  async getProjectEvidence(studentId: string): Promise<ProjectEvidenceRaw[]> {
    const rows = all<{
      id: string;
      project_name: string;
      skills_demonstrated: string;
      technical_depth: string;
      relevant_role: string | null;
      evidence_state: string;
    }>(
      `SELECT id, project_name, skills_demonstrated, technical_depth, relevant_role, evidence_state
       FROM fixture_project_evidence WHERE student_id = ?`,
      [studentId],
    );
    return rows.map((r) => ({
      projectId: r.id,
      projectName: r.project_name,
      skillsDemonstrated: parseJsonArray(r.skills_demonstrated),
      technicalDepth: r.technical_depth,
      relevantRole: r.relevant_role,
      evidenceState: r.evidence_state as EvidenceState,
    }));
  }
}

export class FixtureInterviewEvidenceAdapter implements InterviewEvidencePort {
  async getInterviewEvidence(studentId: string): Promise<InterviewEvidenceRaw[]> {
    const rows = all<{
      id: string;
      interview_name: string;
      outcome: string;
      evaluated_skills: string;
      evidence_state: string;
      occurred_at: string;
    }>(
      `SELECT id, interview_name, outcome, evaluated_skills, evidence_state, occurred_at
       FROM fixture_interview_evidence WHERE student_id = ?`,
      [studentId],
    );
    return rows.map((r) => ({
      interviewId: r.id,
      interviewName: r.interview_name,
      outcome: r.outcome,
      evaluatedSkills: parseJsonArray(r.evaluated_skills),
      evidenceState: r.evidence_state as EvidenceState,
      occurredAt: r.occurred_at,
    }));
  }
}

export function buildFixtureIntelligencePorts() {
  return {
    identity: new FixtureIdentityAdapter(),
    dataVersion: new FixtureDataVersionAdapter(),
    mastery: new FixtureMasterySystemAdapter(),
    roleReadiness: new FixtureRoleReadinessAdapter(),
    skillGap: new FixtureSkillGapAdapter(),
    growth: new FixtureGrowthTrackingAdapter(),
    nextBestAction: new FixtureNextBestActionAdapter(),
    codingEvidence: new FixtureCodingEvidenceAdapter(),
    projectEvidence: new FixtureProjectEvidenceAdapter(),
    interviewEvidence: new FixtureInterviewEvidenceAdapter(),
  };
}
