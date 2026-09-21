// ============================================================================
// Use case: complete session. This is the "Structured Evidence -> Skill
// Signal Engine -> Mastery -> Growth Tracking -> Role Skill Gap -> Role
// Readiness -> Next Best Action" tail of the Phase 80 end-to-end journey.
//
// Everything this function WRITES to another engine goes through the ports
// in src/integration/ports.ts — nothing here computes mastery, rewrites gap
// state, or picks a next activity (Phase 40, 46, 48, 50, 53). It reports
// evidence; the existing engines decide what that evidence means.
// ============================================================================

import { extractSkillEvidence } from "../engine/evidenceExtraction.js";
import { buildInterviewSummary } from "../engine/summary.js";
import { checkCompletion } from "../engine/coverage.js";
import type { ActorContext, EvidenceReference, InterviewSession, InterviewSummary, OrgId, SessionId, SkillEvidence } from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { ConflictError, NotFoundError, logEvent, requireAuthorized, transitionSessionSafely } from "./helpers.js";

export interface CompleteSessionResult {
  session: InterviewSession;
  summary: InterviewSummary;
  skillEvidence: SkillEvidence[];
}

export async function completeSession(
  container: AppContainer,
  actor: ActorContext,
  orgId: OrgId,
  sessionId: SessionId,
): Promise<CompleteSessionResult> {
  const { repositories, ports } = container;
  const session = await repositories.sessions.getById(sessionId, orgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(ports.authz, actor, "INTERVIEW_COMPLETE", orgId, session.studentId);

  if (session.state !== "IN_PROGRESS") {
    throw new ConflictError(`Session ${sessionId} is not IN_PROGRESS (current state: ${session.state}); cannot complete.`);
  }

  // Never complete out from under a dangling question — either it hasn't
  // been answered yet, or its evaluation is still pending. Both are cases
  // where "more evidence required" (Phase 22) simply hasn't resolved yet.
  if (session.currentQuestionId) {
    const response = await repositories.responses.getByQuestionId(session.currentQuestionId, orgId);
    if (!response) {
      throw new ConflictError(`Session ${sessionId} has an unanswered current question; submit a response or cancel before completing.`);
    }
    const evaluation = await repositories.evaluations.getByResponseId(response.id, orgId);
    if (!evaluation || evaluation.status !== "OK") {
      throw new ConflictError(`Session ${sessionId}'s current question evaluation is not resolved (status: ${evaluation?.status ?? "MISSING"}); retry evaluation before completing.`);
    }
  }

  const definition = await repositories.definitions.getById(session.interviewDefinitionId, orgId);
  if (!definition) throw new NotFoundError("InterviewDefinition", session.interviewDefinitionId);
  const { blueprint } = definition;

  const completion = checkCompletion(blueprint.skills, session.coverage, blueprint.completionRequirements, session.questionIds.length);
  // Not gated on completion.isComplete — Phase 73's "Incomplete Assessment"
  // golden case requires the system to be able to end honestly-incomplete,
  // not to refuse to end. completion.reason still gets logged for
  // auditability either way.

  // ---- Phase 44: extract skill evidence for every skill actually touched --
  const allEvaluations = await repositories.evaluations.listBySession(sessionId, orgId);
  const touchedSkillIds = Object.keys(session.coverage) as Array<keyof typeof session.coverage>;

  const skillEvidenceList: SkillEvidence[] = [];
  for (const skillId of touchedSkillIds) {
    const coverageEntry = session.coverage[skillId];
    if (!coverageEntry) continue;
    const evaluationsForSkill = allEvaluations.filter((e) => e.skillId === skillId);
    const evidence = extractSkillEvidence(sessionId, coverageEntry, evaluationsForSkill);
    skillEvidenceList.push(evidence);
    await repositories.skillEvidence.save(evidence, orgId);
  }

  // ---- Phase 45: Skill Signal Engine — the only writer of evidence downstream --
  if (skillEvidenceList.length > 0) {
    const submission = await ports.skillSignalEngine.submitSkillEvidence(skillEvidenceList);
    await logEvent(repositories.events, ports.observability, orgId, sessionId, "skill_signal.submitted", submission);
  }

  // ---- Phase 47: Technical Growth Tracking — append-only evidence events --
  for (const evidence of skillEvidenceList) {
    const sourceReference: EvidenceReference = {
      sourceType: "PREVIOUS_INTERVIEW",
      sourceId: sessionId as unknown as EvidenceReference["sourceId"],
      description: evidence.summary,
      capturedAt: evidence.extractedAt,
    };
    await ports.growthTracking.recordGrowthEvent({
      studentId: session.studentId,
      skillId: evidence.skillId,
      source: "TECHNICAL_INTERVIEW",
      sourceReference,
      evidenceState: evidence.evidenceState,
      confidence: evidence.confidence,
      occurredAt: evidence.extractedAt,
    });
  }

  // ---- Phase 48, 50, 53: report unresolved gaps to Next Best Action -------
  // Feature 34 never picks the next activity — it only tells Next Best
  // Action which skills still need attention and why.
  const roleGaps = await ports.roleSkillGap.getSkillGaps(session.studentId, session.roleId, orgId);
  const highPriorityGapSkillIds = new Set(roleGaps.filter((g) => g.priority === "HIGH" || g.priority === "MEDIUM").map((g) => g.skillId));
  for (const evidence of skillEvidenceList) {
    const stillWeak = evidence.evidenceState === "UNCERTAIN" || evidence.evidenceState === "UNASSESSED";
    if (stillWeak && highPriorityGapSkillIds.has(evidence.skillId)) {
      await ports.nextBestAction.notifyGapIdentified({
        studentId: session.studentId,
        roleId: session.roleId,
        skillId: evidence.skillId,
        evidenceState: evidence.evidenceState,
        reason: `Technical interview evidence remained ${evidence.evidenceState.toLowerCase()} for a role-critical skill.`,
        sourceSessionId: sessionId,
      });
    }
  }

  // ---- Phase 43: build the structured summary -------------------------------
  const summary = buildInterviewSummary(session, blueprint.skills, blueprint.completionRequirements, allEvaluations);

  const completedSession = await transitionSessionSafely(repositories.sessions, sessionId, orgId, "COMPLETED");

  await logEvent(
    repositories.events,
    ports.observability,
    orgId,
    sessionId,
    "session.completed",
    { assessmentComplete: summary.assessmentComplete, completionReason: completion.reason, skillsEvidenced: skillEvidenceList.length },
    "interview.completed",
  );

  return { session: completedSession, summary, skillEvidence: skillEvidenceList };
}
