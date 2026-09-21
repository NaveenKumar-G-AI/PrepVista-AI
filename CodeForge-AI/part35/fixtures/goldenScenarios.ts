import { InMemoryInterviewRepository } from "../src/repository/interviewRepository.memory.js";
import { InterviewOrchestrator } from "../src/orchestration/interviewOrchestrator.js";
import {
  InMemoryRoleSkillModel,
  InMemoryCandidateEvidenceSource,
  RecordingSkillSignalEngine,
  UnavailableReasoningVerification,
  UnavailableDebuggingCoach,
  NoopVoice,
  SimulatedAIGateway,
} from "../src/integration/devAdapters.js";
import type { AuditEvent } from "../src/integration/ports.js";
import type { TenantContext, CandidateEvidenceBundle } from "../src/domain/types.js";

export const FIXTURE_ORG = "org-fixture-0001";

class RecordingAuditLog {
  public events: AuditEvent[] = [];
  async record(event: AuditEvent) {
    this.events.push(event);
  }
}

export function freshHarness() {
  const repo = new InMemoryInterviewRepository();
  const roleSkillModel = new InMemoryRoleSkillModel();
  const candidateEvidence = new InMemoryCandidateEvidenceSource();
  const skillSignalEngine = new RecordingSkillSignalEngine();
  const aiGateway = new SimulatedAIGateway();
  const auditLog = new RecordingAuditLog();

  const orchestrator = new InterviewOrchestrator({
    repo,
    roleSkillModel,
    candidateEvidence,
    skillSignalEngine,
    aiGateway,
    voice: new NoopVoice(),
    auditLog,
  });

  return { repo, roleSkillModel, candidateEvidence, skillSignalEngine, aiGateway, auditLog, orchestrator };
}

export function staffCtx(): TenantContext {
  return { orgId: FIXTURE_ORG, actorId: "staff-0001", actorRole: "STAFF" };
}
export function candidateCtx(candidateId: string): TenantContext {
  return { orgId: FIXTURE_ORG, actorId: candidateId, actorRole: "CANDIDATE" };
}

/** FIXTURE candidate personas, matching the demo-verification style already used for CodeForge's other Feature builds. Not real students. */
export const FIXTURE_CANDIDATES = {
  strongProjectDefender: "cand-fixture-strong-0001",
  weakExplainer: "cand-fixture-weak-explainer-0001",
  inconsistentAnswerer: "cand-fixture-inconsistent-0001",
  progressiveDepth: "cand-fixture-progressive-0001",
  partialCoverage: "cand-fixture-partial-0001",
};

export function seedTwoCoreSkillRole(roleSkillModel: InMemoryRoleSkillModel, role = "Backend Engineer") {
  roleSkillModel.register({
    role,
    skills: [
      { skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" },
      { skill: "API_DESIGN", importance: "CORE", expectedDifficulty: "MEDIUM" },
    ],
  });
}

export function seedOneCoreSkillRole(roleSkillModel: InMemoryRoleSkillModel, role: string, skill: string) {
  roleSkillModel.register({ role, skills: [{ skill, importance: "CORE", expectedDifficulty: "MEDIUM" }] });
}

export function seedProjectEvidence(
  candidateEvidence: InMemoryCandidateEvidenceSource,
  candidateId: string,
  skill: string,
  summary: string
): void {
  const bundle: CandidateEvidenceBundle = { candidateId, bySkill: { [skill]: [{
    sourceType: "PROJECT_SUBMISSION",
    artifactId: `proj-${candidateId}-${skill}`,
    skill,
    summary,
    capturedAt: new Date().toISOString(),
  }] } };
  candidateEvidence.seed(bundle);
}

export function seedCodeEvidence(
  candidateEvidence: InMemoryCandidateEvidenceSource,
  candidateId: string,
  skill: string,
  summary: string,
  content: string
): void {
  const bundle: CandidateEvidenceBundle = { candidateId, bySkill: { [skill]: [{
    sourceType: "CODING_SUBMISSION",
    artifactId: `code-${candidateId}-${skill}`,
    skill,
    summary,
    content,
    capturedAt: new Date().toISOString(),
  }] } };
  candidateEvidence.seed(bundle);
}

/** Runs submitResponse repeatedly with sequential idempotency keys until COMPLETED, an EVALUATION_FAILED, or the scripted answers run out. Returns every NEXT_QUESTION/COMPLETED result in order for the test to inspect. */
export async function runConversation(
  orchestrator: InterviewOrchestrator,
  ctx: TenantContext,
  sessionId: string,
  firstQuestionId: string,
  answers: string[]
) {
  const results: Array<Awaited<ReturnType<InterviewOrchestrator["submitResponse"]>>> = [];
  let questionId = firstQuestionId;
  for (let i = 0; i < answers.length; i++) {
    const result = await orchestrator.submitResponse(ctx, {
      sessionId,
      questionId,
      responseText: answers[i]!,
      idempotencyKey: `fixture-key-${sessionId}-${i}`,
    });
    results.push(result);
    if (result.status === "COMPLETED" || result.status === "EVALUATION_FAILED") break;
    if (result.status === "NEXT_QUESTION") questionId = result.question.id;
  }
  return results;
}
