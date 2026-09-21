// ============================================================================
// Phase 37 — "Every attempt must remain independently accessible according
// to authorization. Never overwrite historical interviews."
// Phase 59 — institutional (trainer/TPO/admin) aggregate views, without
// exposing private student responses without authorization.
// ============================================================================

import { buildInterviewSummary } from "../engine/summary.js";
import type { ActorContext, Evaluation, InterviewSession, InterviewSummary, OrgId, RoleId, SessionId, SkillEvidence, StudentId } from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { NotFoundError, requireAuthorized } from "./helpers.js";

export async function getInterviewHistory(container: AppContainer, actor: ActorContext, orgId: OrgId, studentId: StudentId): Promise<InterviewSession[]> {
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW_HISTORY", orgId, studentId);
  // In-memory repo already returns newest-insertion-order; real adapter
  // should order by createdAt DESC. Sessions are never overwritten — each
  // completed/cancelled attempt stays exactly as it finished (Phase 37).
  return container.repositories.sessions.listByStudent(studentId, orgId);
}

export async function getSessionEvaluations(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<Evaluation[]> {
  const session = await container.repositories.sessions.getById(sessionId, orgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW", orgId, session.studentId);
  return container.repositories.evaluations.listBySession(sessionId, orgId);
}

export async function getSessionSkillEvidence(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<SkillEvidence[]> {
  const session = await container.repositories.sessions.getById(sessionId, orgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW", orgId, session.studentId);
  return container.repositories.skillEvidence.listBySession(sessionId, orgId);
}

/**
 * Read-only, idempotent, callable at any session state (Phase 58's summary
 * view is naturally reached both right after completion AND later when
 * revisiting history). This recomputes from persisted evaluations rather
 * than storing a separate summary row — buildInterviewSummary is pure, so
 * recomputation is cheap and can never drift from the source evaluations.
 * Distinct from completeSession(), which additionally transitions state and
 * fans out to the six downstream engines — this function does neither.
 */
export async function getInterviewSummary(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<InterviewSummary> {
  const { repositories } = container;
  const session = await repositories.sessions.getById(sessionId, orgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW", orgId, session.studentId);

  const definition = await repositories.definitions.getById(session.interviewDefinitionId, orgId);
  if (!definition) throw new NotFoundError("InterviewDefinition", session.interviewDefinitionId);

  const evaluations = await repositories.evaluations.listBySession(sessionId, orgId);
  return buildInterviewSummary(session, definition.blueprint.skills, definition.blueprint.completionRequirements, evaluations);
}

// ---- Phase 59: institutional aggregate reporting ---------------------------

export interface InstitutionalInterviewReport {
  roleId: RoleId;
  totalSessions: number;
  completedSessions: number;
  completionRate: number; // 0-1
  commonGapSkillIds: Array<{ skillId: string; occurrences: number }>;
  averageQuestionsPerSession: number;
}

/**
 * Aggregate-only: no individual student response, transcript, or evaluation
 * text ever appears in this return value (Phase 59). Only counts and skill
 * ids — the same boundary the per-session query functions above enforce via
 * authz, applied here at the shape level too, so an aggregate reporting
 * endpoint can never accidentally leak a transcript through a wide select.
 */
export async function getInstitutionalReport(
  container: AppContainer,
  actor: ActorContext,
  orgId: OrgId,
  roleId: RoleId,
  studentIdsInScope: StudentId[],
): Promise<InstitutionalInterviewReport> {
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW_INSTITUTIONAL_REPORTS", orgId);

  const allSessions: InterviewSession[] = [];
  for (const studentId of studentIdsInScope) {
    const sessions = await container.repositories.sessions.listByStudent(studentId, orgId);
    allSessions.push(...sessions.filter((s) => s.roleId === roleId));
  }

  const completed = allSessions.filter((s) => s.state === "COMPLETED");
  const gapCounts = new Map<string, number>();
  for (const session of completed) {
    for (const [skillId, entry] of Object.entries(session.coverage)) {
      if (entry && (entry.status === "UNCERTAIN" || entry.status === "NOT_ASSESSED")) {
        gapCounts.set(skillId, (gapCounts.get(skillId) ?? 0) + 1);
      }
    }
  }
  const commonGapSkillIds = [...gapCounts.entries()]
    .map(([skillId, occurrences]) => ({ skillId, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences);

  const totalQuestions = allSessions.reduce((sum, s) => sum + s.questionIds.length, 0);

  return {
    roleId,
    totalSessions: allSessions.length,
    completedSessions: completed.length,
    completionRate: allSessions.length === 0 ? 0 : completed.length / allSessions.length,
    commonGapSkillIds,
    averageQuestionsPerSession: allSessions.length === 0 ? 0 : totalQuestions / allSessions.length,
  };
}
