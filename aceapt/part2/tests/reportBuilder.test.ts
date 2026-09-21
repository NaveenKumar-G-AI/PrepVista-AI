import { describe, expect, it } from "vitest";
import { buildDiagnosticResult } from "@/lib/domain/reportBuilder";
import { computeCapabilityState } from "@/lib/domain/capabilityState";
import { SKILLS } from "@/data/seed/skills";
import type { DiagnosticSession, OnboardingContext } from "@/lib/domain/types";
import { makeAttempt } from "./helpers/fixtures";

const session: DiagnosticSession = {
  id: "sess_1",
  studentId: "stu_1",
  onboardingContextId: "onb_1",
  onboardingContextVersion: 1,
  diagnosticVersion: 1,
  status: "IN_PROGRESS",
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  stopReason: null,
};

const baseOnboarding: OnboardingContext = {
  id: "onb_1",
  studentId: "stu_1",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  preparationGoal: "Campus placement",
  targetDate: null,
  timelineCategory: "MODERATE",
  daysAvailable: null,
  experienceLevel: "FIRST_TIME",
  previousPreparation: null,
  confidenceQuantitative: "MEDIUM",
  confidenceLogical: "MEDIUM",
  confidenceVerbal: "MEDIUM",
  confidenceTimePressure: "MEDIUM",
  primaryPainPoint: "CONCEPTUAL_GAPS",
  secondaryPainPoints: [],
};

describe("buildDiagnosticResult", () => {
  it("names the deeper prerequisite as a possible root cause, not just the visibly weak skill", () => {
    const history = [
      makeAttempt({ questionId: "Q_PNL_3", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "COVERAGE", correct: false, sequenceIndex: 0 }),
      makeAttempt({ questionId: "Q_PNL_4", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "VERIFICATION", correct: false, sequenceIndex: 1 }),
      makeAttempt({ questionId: "Q_PCT_A_1", skillNodeId: "Q_PCT_A", applicationType: "APPLICATION", difficulty: 2, purpose: "PREREQUISITE_CHECK", correct: false, sequenceIndex: 2 }),
      makeAttempt({ questionId: "Q_PCT_A_2", skillNodeId: "Q_PCT_A", applicationType: "APPLICATION", difficulty: 3, purpose: "COVERAGE", correct: false, sequenceIndex: 3 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const result = buildDiagnosticResult(session, state, baseOnboarding, SKILLS);

    expect(result.possibleRootCauses.length).toBeGreaterThan(0);
    const finding = result.possibleRootCauses.find((f) => f.skillId === "Q_PNL");
    expect(finding).toBeDefined();
    expect(finding!.relatedSkillId).toBe("Q_PCT_A");
    expect(result.focusAreas).toContain("Q_PNL");
    expect(result.recommendedStartingPointSkillId).toBe("Q_PCT_A");
  });

  it("flags an unexpected strength when self-rating is low but measured accuracy is high", () => {
    const onboarding: OnboardingContext = { ...baseOnboarding, confidenceVerbal: "LOW" };
    const history = [
      makeAttempt({ questionId: "V_VOC_1", skillNodeId: "V_VOC", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
      makeAttempt({ questionId: "V_VOC_2", skillNodeId: "V_VOC", applicationType: "FOUNDATION", difficulty: 2, purpose: "DIFFICULTY_ESCALATION", correct: true, sequenceIndex: 1 }),
      makeAttempt({ questionId: "V_VOC_3", skillNodeId: "V_VOC", applicationType: "APPLICATION", difficulty: 3, purpose: "DIFFICULTY_ESCALATION", correct: true, sequenceIndex: 2 }),
      makeAttempt({ questionId: "V_VOC_4", skillNodeId: "V_VOC", applicationType: "TRANSFER", difficulty: 4, purpose: "DIFFICULTY_ESCALATION", correct: true, sequenceIndex: 3 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const result = buildDiagnosticResult(session, state, onboarding, SKILLS);

    const verbalDomain = result.domainResults.find((d) => d.domain === "VERBAL")!;
    expect(verbalDomain.accuracy).toBe(1);
    expect(result.unexpectedFindings.some((f) => f.kind === "UNDERRATED_STRENGTH" && f.domain === "VERBAL")).toBe(true);
    expect(result.strengths).toContain("V_VOC");
  });

  it("does not claim a strength or a surprise from a single lucky answer (insufficient evidence)", () => {
    const onboarding: OnboardingContext = { ...baseOnboarding, confidenceLogical: "LOW" };
    const history = [
      makeAttempt({ questionId: "L_SEQ_1", skillNodeId: "L_SEQ", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const result = buildDiagnosticResult(session, state, onboarding, SKILLS);

    expect(result.strengths).toHaveLength(0);
    expect(result.unexpectedFindings.some((f) => f.domain === "LOGICAL")).toBe(false);
  });

  it("leaves overallCapability at NOT_ASSESSED and gives a safe fallback starting point with zero responses", () => {
    const state = computeCapabilityState("sess_1", [], SKILLS);
    const result = buildDiagnosticResult(session, state, baseOnboarding, SKILLS);

    expect(result.overallCapability).toBe("NOT_ASSESSED");
    expect(result.recommendedStartingPointSkillId).toBeNull();
    expect(result.recommendedStartingPointReason.length).toBeGreaterThan(0);
  });
});
