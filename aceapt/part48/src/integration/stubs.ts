/**
 * Integration seams for the ACEAPT features and platform services Feature 48 depends on.
 *
 * NONE OF THIS FILE IS REAL PRODUCT LOGIC. Per the reuse-first rule (spec §7–§8), Feature 48
 * should call the *existing* ACEAPT implementations of Features 42/45/46/47/49, Mistake
 * Intelligence, Confidence Intelligence, Mastery, assessment configuration, and session state.
 * No ACEAPT repository was attached to this build, so each dependency below is a small, clearly
 * labelled stand-in behind the exact interface Feature 48 needs.
 *
 * To wire this into the real system: replace the body of each class with a call into the real
 * service. Nothing in src/policy, src/generation, src/validation, or src/api needs to change,
 * because they only ever talk to these interfaces.
 */

import { AssessmentMode, MistakeSignal } from "../domain/types";
import { getTrustedQuestionOrThrow } from "../domain/sampleData";

/** Feature 47 — Guided Solving: "what step is the student on right now?" (§41) */
export interface StepContext {
  stepId: string;
  index: number;
  totalSteps: number;
}
export class GuidedSolvingService {
  getCurrentStep(problemId: string, stepId: string): StepContext {
    const q = getTrustedQuestionOrThrow(problemId);
    const index = q.solutionSteps.findIndex((s) => s.stepId === stepId);
    return { stepId, index: Math.max(index, 0), totalSteps: q.solutionSteps.length };
  }
}

/** Feature 45 — Aptitude Skill Graph: prerequisite risk context (§43). */
export class SkillGraphService {
  getPrerequisiteRisk(_skillId: string): { prerequisiteId: string; atRisk: boolean } | null {
    // STUB — a real implementation looks at prerequisite mastery in the skill graph and
    // returns something like { prerequisiteId: "ratios-basic", atRisk: true }. §43 is explicit
    // that Feature 48 must not auto-modify the global graph on the basis of this signal.
    return null;
  }
}

/** Mistake Intelligence — classifies a submitted attempt against the trusted solution (§44). */
export class MistakeIntelligenceService {
  classify(problemId: string, stepId: string, attemptRaw: string): MistakeSignal {
    const q = getTrustedQuestionOrThrow(problemId);
    const step = q.solutionSteps.find((s) => s.stepId === stepId);
    if (!step) return MistakeSignal.NONE;
    const normalized = attemptRaw.trim();
    if (!q.classifyMistake) return MistakeSignal.CALCULATION_ERROR;
    return q.classifyMistake(stepId, normalized);
  }
}

/** Confidence Intelligence — is the student hesitant despite being right? (§46) */
export class ConfidenceEngineService {
  isHesitantDespiteCorrect(_studentId: string, _skillId: string): boolean {
    return false; // STUB — wire to the real confidence signal store.
  }
}

/** Mastery — where hint-assisted evidence eventually lands, explicitly labelled as such (§50). */
export class MasteryService {
  recordAssistedEvidence(input: { studentId: string; skillId: string; hintLevel: number }): void {
    // STUB — forward to the real mastery service. The label matters: this must never be recorded
    // the same way as an independent, unassisted correct answer (§50, §101).
    void input;
  }
}

/** Assessment configuration — governs whether hints exist at all right now (§32, §72). */
export class AssessmentConfigService {
  private modeOverrides = new Map<string, AssessmentMode>();
  private permittedOverrides = new Map<string, boolean>();

  getMode(sessionId: string): AssessmentMode {
    return this.modeOverrides.get(sessionId) ?? AssessmentMode.PRACTICE;
  }
  hintsExplicitlyPermitted(sessionId: string): boolean {
    return this.permittedOverrides.get(sessionId) ?? false;
  }
  /** Test/demo helper only — a real implementation reads this from the assessment's own config. */
  setSessionMode(sessionId: string, mode: AssessmentMode, hintsPermitted = false): void {
    this.modeOverrides.set(sessionId, mode);
    this.permittedOverrides.set(sessionId, hintsPermitted);
  }
}

/** Student session state — attempt counts, timing, and context versioning (§70–§71). */
export class StudentSessionService {
  private attemptContextVersions = new Map<string, number>();
  private sessionOwners = new Map<string, string>();

  bumpAttemptContextVersion(sessionId: string, stepId: string): number {
    const key = `${sessionId}:${stepId}`;
    const next = (this.attemptContextVersions.get(key) ?? 0) + 1;
    this.attemptContextVersions.set(key, next);
    return next;
  }
  getAttemptContextVersion(sessionId: string, stepId: string): number {
    return this.attemptContextVersions.get(`${sessionId}:${stepId}`) ?? 0;
  }
  /** §73 — student ownership check backing the auth middleware. */
  setOwner(sessionId: string, studentId: string): void {
    this.sessionOwners.set(sessionId, studentId);
  }
  getOwner(sessionId: string): string | undefined {
    return this.sessionOwners.get(sessionId);
  }
}
