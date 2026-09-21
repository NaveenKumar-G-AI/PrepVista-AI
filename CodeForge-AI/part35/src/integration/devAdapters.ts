/**
 * DEV-ONLY reference adapters.
 *
 * None of these talk to a real CodeForge service — there is no reachable
 * repository for the Role-Based Skill Model, the Skill Signal Engine,
 * Reasoning Verification, the Debugging Coach, or a real voice engine in
 * this sandbox (see TRUTH_TABLE.md). Swapping any one of these for the
 * real implementation should be a one-file change: write a class that
 * implements the same port and pass it into interviewOrchestrator instead.
 */
import { randomUUID } from "node:crypto";
import type {
  RoleSkillModelPort,
  CandidateEvidencePort,
  SkillSignalEnginePort,
  ReasoningVerificationPort,
  DebuggingCoachPort,
  AIGatewayPort,
  VoicePort,
  AuditLogPort,
  GenerateQuestionInput,
  GeneratedQuestionDraft,
  EvaluateResponseInput,
} from "./ports.js";
import type { CandidateEvidenceBundle, RoleSkillRequirements, SkillEvidenceRecord, StructuredEvaluation, FollowUpReason } from "../domain/types.js";

/** In-memory stand-in for the Role-Based Skill Model (§9). Seed it with fixtures in tests; a real adapter would call the real service instead. */
export class InMemoryRoleSkillModel implements RoleSkillModelPort {
  constructor(private readonly registry: Map<string, RoleSkillRequirements> = new Map()) {}

  register(req: RoleSkillRequirements) {
    this.registry.set(req.role, req);
  }

  async getRoleSkillRequirements(_orgId: string, role: string): Promise<RoleSkillRequirements> {
    const found = this.registry.get(role);
    if (!found) {
      // §9: never invent role requirements — an unknown role is an error, not a guess.
      throw new Error(`No role skill requirements registered for role "${role}"`);
    }
    return found;
  }
}

/** In-memory stand-in for pulling existing evidence (§10). Missing sources stay missing — never backfilled. */
export class InMemoryCandidateEvidenceSource implements CandidateEvidencePort {
  constructor(private readonly store: Map<string, CandidateEvidenceBundle> = new Map()) {}

  /** Merges into whatever is already stored for this candidate — calling seed() once per skill (the natural way to build up a fixture) must not clobber skills seeded in an earlier call. */
  seed(bundle: CandidateEvidenceBundle) {
    const existing = this.store.get(bundle.candidateId) ?? { candidateId: bundle.candidateId, bySkill: {} };
    const merged: CandidateEvidenceBundle = {
      candidateId: bundle.candidateId,
      bySkill: { ...existing.bySkill, ...bundle.bySkill },
    };
    this.store.set(bundle.candidateId, merged);
  }

  async getExistingEvidence(_orgId: string, candidateId: string, skills: string[]): Promise<CandidateEvidenceBundle> {
    const existing = this.store.get(candidateId) ?? { candidateId, bySkill: {} };
    const filtered: CandidateEvidenceBundle = { candidateId, bySkill: {} };
    for (const skill of skills) {
      if (existing.bySkill[skill]) filtered.bySkill[skill] = existing.bySkill[skill];
      // skills with no evidence are simply absent from bySkill — not populated as empty/zero.
    }
    return filtered;
  }
}

/** Records what was submitted, for tests to assert against. A real adapter posts to the real Skill Signal Engine's ingestion endpoint instead. */
export class RecordingSkillSignalEngine implements SkillSignalEnginePort {
  public submissions: Array<{ orgId: string; candidateId: string; sessionId: string; evidence: SkillEvidenceRecord[] }> = [];

  async submitInterviewEvidence(input: Parameters<SkillSignalEnginePort["submitInterviewEvidence"]>[0]): Promise<void> {
    this.submissions.push(input);
  }
}

/** §23 — always returns null (evidence "not available"), matching §10's rule that a missing source stays missing rather than being faked. */
export class UnavailableReasoningVerification implements ReasoningVerificationPort {
  async evaluateReasoning(): ReturnType<ReasoningVerificationPort["evaluateReasoning"]> {
    return null;
  }
}

/** §24 — same "not available" stance as above. */
export class UnavailableDebuggingCoach implements DebuggingCoachPort {
  async scoreDebuggingTrace(): ReturnType<DebuggingCoachPort["scoreDebuggingTrace"]> {
    return null;
  }
}

export class NoopVoice implements VoicePort {
  async speechToText(): Promise<{ text: string } | null> {
    return null; // always "fails" -> exercises the §36 text fallback path
  }
  async textToSpeech(): Promise<Uint8Array | null> {
    return null;
  }
}

export class ConsoleAuditLog implements AuditLogPort {
  public events: Array<Parameters<AuditLogPort["record"]>[0]> = [];
  async record(event: Parameters<AuditLogPort["record"]>[0]): Promise<void> {
    this.events.push(event);
  }
}

/**
 * Deterministic simulated AI gateway used by the automated test suite.
 * This is NOT a live model call (no provider is reachable from this
 * sandbox without a real key) — it is a rule-based stand-in that honors
 * the exact same contract (GenerateQuestionInput -> GeneratedQuestionDraft,
 * EvaluateResponseInput -> evaluation) that src/integration/aiGatewayAdapter.groq.ts
 * sends to a real provider. It exists so the orchestration pipeline —
 * grounding checks, follow-up selection, coverage tracking — can be
 * exercised end-to-end and asserted on deterministically. A production
 * deployment swaps this for GroqAIGatewayAdapter (or an equivalent) once a
 * real API key is supplied.
 */
export class SimulatedAIGateway implements AIGatewayPort {
  /** Test hook: force the next N evaluations to a specific quality, to drive the golden scenarios. */
  public scriptedAnswerQuality: StructuredEvaluation["answerQuality"][] = [];
  public scriptedConsistency: StructuredEvaluation["consistency"][] = [];
  public failNextEvaluation = false;

  async generateQuestion(input: GenerateQuestionInput): Promise<GeneratedQuestionDraft> {
    const grounded = Boolean(input.evidence);
    const core = depthPrompt(input);
    const phrased = phraseForFollowUpReason(core, input.followUpReason);
    const prompt = grounded
      ? `Regarding your ${input.evidence!.sourceType.toLowerCase().replace(/_/g, " ")} ("${input.evidence!.summary}"): ${phrased}`
      : `${phrased} (general ${input.skill} question — no candidate-specific evidence available for this one)`;
    return {
      promptText: prompt,
      questionType: input.questionType,
      skill: input.skill,
      difficulty: input.difficulty,
      citedEvidenceArtifactId: input.evidence?.artifactId,
    };
  }

  async evaluateResponse(
    input: EvaluateResponseInput
  ): Promise<Omit<StructuredEvaluation, "id" | "responseId" | "evaluationVersion">> {
    if (this.failNextEvaluation) {
      this.failNextEvaluation = false;
      throw new Error("simulated AI gateway failure");
    }
    const answerQuality = this.scriptedAnswerQuality.shift() ?? inferQualityFromLength(input.responseText);
    const consistency = this.scriptedConsistency.shift() ?? "CONSISTENT";
    const confidence = answerQuality === "CORRECT" || answerQuality === "MOSTLY_CORRECT" ? "HIGH" : answerQuality === "DONT_KNOW" || answerQuality === "INSUFFICIENT" ? "LOW" : "MODERATE";

    return {
      answerQuality,
      consistency,
      dimensions: {
        TECHNICAL_CORRECTNESS: bandFor(answerQuality),
        REASONING_QUALITY: bandFor(answerQuality),
        UNDERSTANDING: bandFor(answerQuality),
      },
      evidenceConfidence: confidence,
      rationaleSummary: `Simulated evaluation for skill ${input.skill}: response classified ${answerQuality}.`,
      status: "COMPLETED",
      grounded: Boolean(input.evidence),
    };
  }
}

function depthPrompt(input: GenerateQuestionInput): string {
  switch (input.depthLevel) {
    case "DEFINITION":
      return `What is ${input.skill}, in your own words?`;
    case "APPLICATION":
      return `Walk me through how you applied ${input.skill} here.`;
    case "REASONING":
      return `Why did you choose this approach over the alternatives?`;
    case "TRADE_OFF":
      return `What trade-offs did that choice involve?`;
    case "FAILURE_SCENARIO":
      return `What would break first if this had to handle 100x the load?`;
  }
}

/**
 * A CLARIFICATION/VERIFICATION/EVIDENCE_CHECK follow-up deliberately stays
 * at the SAME depth level as the question it follows (§26 — it's re-asking,
 * not progressing the ladder), which means the base depthPrompt() text
 * alone would be identical to the question just asked. Real interviewers
 * naturally rephrase a repeat question; this stand-in does the same so the
 * two are never literally identical text (questionValidation.ts correctly
 * rejects an exact duplicate — that check is protecting against a real
 * failure mode, not something to work around by weakening it).
 */
function phraseForFollowUpReason(core: string, reason: FollowUpReason | undefined): string {
  switch (reason) {
    case "CLARIFICATION":
      return `Could you clarify — ${lowerFirst(core)}`;
    case "VERIFICATION":
      return `Just to double-check: ${lowerFirst(core)}`;
    case "EVIDENCE_CHECK":
      return `I want to reconcile that with what you actually submitted — ${lowerFirst(core)}`;
    case "DEEPER":
    case undefined:
      return core;
  }
}

function lowerFirst(s: string): string {
  return s.length ? s[0]!.toLowerCase() + s.slice(1) : s;
}

function inferQualityFromLength(text: string): StructuredEvaluation["answerQuality"] {
  const t = text.trim().toLowerCase();
  if (t === "i don't know" || t === "i dont know" || t === "not sure") return "DONT_KNOW";
  if (t.length < 15) return "INSUFFICIENT";
  if (t.length < 60) return "PARTIALLY_CORRECT";
  return "MOSTLY_CORRECT";
}

function bandFor(q: StructuredEvaluation["answerQuality"]): "STRONG" | "ADEQUATE" | "WEAK" {
  if (q === "CORRECT" || q === "MOSTLY_CORRECT") return "STRONG";
  if (q === "PARTIALLY_CORRECT") return "ADEQUATE";
  return "WEAK";
}

export function newId(): string {
  return randomUUID();
}
