/**
 * Integration ports.
 *
 * Every interface in this file stands in for a CodeForge system that
 * already exists per the build spec (§3) and that Feature 35 must NOT
 * rebuild (§77): Role-Based Skill Model, candidate evidence sources,
 * Skill Signal Engine, Reasoning Verification, Debugging Coach, an AI
 * gateway, voice infra, and audit/observability.
 *
 * This sandbox has no network path to the real CodeForge repository, so
 * these are contracts, not wired integrations — exactly like the API keys
 * this build intentionally leaves blank. Swapping a dev/simulated adapter
 * (src/integration/devAdapters.ts) for a real one should never require
 * touching orchestration code, only wiring a new class that implements
 * the same port.
 */

import type {
  CandidateEvidenceBundle,
  RoleSkillRequirements,
  SkillEvidenceRecord,
  StructuredEvaluation,
  InterviewQuestion,
  InterviewBlueprint,
  FollowUpReason,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// §9 Role integration — never invent role requirements locally
// ---------------------------------------------------------------------------
export interface RoleSkillModelPort {
  getRoleSkillRequirements(orgId: string, role: string): Promise<RoleSkillRequirements>;
}

// ---------------------------------------------------------------------------
// §10 Candidate evidence — only return what actually exists
// ---------------------------------------------------------------------------
export interface CandidateEvidencePort {
  getExistingEvidence(orgId: string, candidateId: string, skills: string[]): Promise<CandidateEvidenceBundle>;
}

// ---------------------------------------------------------------------------
// §43/§46/§47 — Feature 35 emits evidence; it never sets mastery/readiness/
// gap/next-action itself. The Skill Signal Engine is the front door; what
// happens downstream (Mastery, Growth, Role Gap, Readiness, Next Best
// Action) is that engine's responsibility, not this feature's.
// ---------------------------------------------------------------------------
export interface SkillSignalEnginePort {
  submitInterviewEvidence(input: {
    orgId: string;
    candidateId: string;
    sessionId: string;
    evidence: SkillEvidenceRecord[];
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// §23 Reasoning Verification — existing engine, reused not rebuilt
// ---------------------------------------------------------------------------
export interface ReasoningVerificationPort {
  evaluateReasoning(input: {
    orgId: string;
    candidateId: string;
    claim: string;
    context: string;
  }): Promise<{ classification: "SOUND" | "PARTIALLY_SOUND" | "UNSOUND" | "INSUFFICIENT"; notes: string } | null>;
}

// ---------------------------------------------------------------------------
// §24 Debugging Mode / Debugging Coach — existing engine, reused not rebuilt
// ---------------------------------------------------------------------------
export interface DebuggingCoachPort {
  scoreDebuggingTrace(input: {
    orgId: string;
    candidateId: string;
    symptom: string;
    steps: string[];
  }): Promise<{ reachedRootCause: boolean; quality: "STRONG" | "ADEQUATE" | "WEAK" } | null>;
}

// ---------------------------------------------------------------------------
// §16-18, §42-45 AI gateway — the only place an LLM is called from.
// Feature 35's own code must never hallucinate; grounding is enforced by
// validating the returned JSON against the context that was actually sent
// (evaluationPipeline.ts), not by trusting the model.
// ---------------------------------------------------------------------------
export interface GenerateQuestionInput {
  orgId: string;
  role: string;
  skill: string;
  questionType: InterviewQuestion["questionType"];
  difficulty: InterviewQuestion["difficulty"];
  depthLevel: InterviewQuestion["depthLevel"];
  /** Why this question is being generated — a fresh topic vs. a specific kind of follow-up. A real model (and the simulated one) needs this to phrase a clarification differently from the question it's clarifying, even when both sit at the same depth level. Absent for a brand-new topic's root question. */
  followUpReason?: FollowUpReason;
  /** The actual evidence artifact this question must ground itself in, if any. Never fabricate a project/code feature the candidate didn't actually submit (§44). */
  evidence?: { sourceType: string; artifactId: string; summary: string; content?: string };
  previousQuestions: string[];
  previousAnswerSummaries: string[];
}

export interface GeneratedQuestionDraft {
  promptText: string;
  questionType: InterviewQuestion["questionType"];
  skill: string;
  difficulty: InterviewQuestion["difficulty"];
  /** Model must echo back which evidence (if any) it actually used, so questionValidation can check it wasn't invented (§17, §44). */
  citedEvidenceArtifactId?: string;
}

export interface EvaluateResponseInput {
  orgId: string;
  role: string;
  skill: string;
  questionText: string;
  questionType: InterviewQuestion["questionType"];
  responseText: string;
  evidence?: { sourceType: string; artifactId: string; content?: string };
  dimensions: string[];
}

export interface AIGatewayPort {
  generateQuestion(input: GenerateQuestionInput): Promise<GeneratedQuestionDraft>;
  evaluateResponse(input: EvaluateResponseInput): Promise<Omit<StructuredEvaluation, "id" | "responseId" | "evaluationVersion">>;
}

// ---------------------------------------------------------------------------
// §34-36 Voice — Feature 35 owns the fallback decision, not the engine
// ---------------------------------------------------------------------------
export interface VoicePort {
  speechToText(audio: Uint8Array): Promise<{ text: string } | null>; // null == failure, triggers §36 fallback
  textToSpeech(text: string): Promise<Uint8Array | null>;
}

// ---------------------------------------------------------------------------
// §65 Auditability — every important event, recorded somewhere the client
// can't tamper with. Feature 35 calls this; the existing observability
// stack owns storage/alerting.
// ---------------------------------------------------------------------------
export interface AuditEvent {
  orgId: string;
  sessionId: string | null;
  eventType: string;
  actor: "CANDIDATE" | "SYSTEM" | "AI";
  metadata: Record<string, unknown>;
}
export interface AuditLogPort {
  record(event: AuditEvent): Promise<void>;
}
