import { beforeEach, describe, expect, it } from "vitest";
import { buildDeterministicNarrative, generateAiNarrative } from "@/lib/ai/interpretFindings";
import type { DiagnosticResult } from "@/lib/domain/types";

function fakeResult(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    id: "result_1",
    sessionId: "sess_1",
    studentId: "stu_1",
    diagnosticVersion: 1,
    scoringVersion: 1,
    algorithmVersion: 1,
    overallCapability: "DEVELOPING",
    totalQuestions: 16,
    domainResults: [],
    skillResults: [
      {
        skillId: "Q_NS",
        skillName: "Number Systems — Divisibility & Remainders",
        domain: "QUANTITATIVE",
        overall: { evidenceLevel: "STRONG", attempts: 4, correct: 4, accuracy: 1, avgResponseTimeMs: 3000 },
        foundation: { evidenceLevel: "STRONG", attempts: 2, correct: 2, accuracy: 1, avgResponseTimeMs: 3000 },
        application: { evidenceLevel: "NOT_ASSESSED", attempts: 0, correct: 0, accuracy: null, avgResponseTimeMs: null },
        transfer: { evidenceLevel: "NOT_ASSESSED", attempts: 0, correct: 0, accuracy: null, avgResponseTimeMs: null },
      },
    ],
    selfPerceptionByDomain: { QUANTITATIVE: "MEDIUM", LOGICAL: "MEDIUM", VERBAL: "MEDIUM" },
    accuracyOverall: 0.6,
    speedProfileOverall: "MODERATE",
    strengths: ["Q_NS"],
    focusAreas: [],
    possibleRootCauses: [],
    unexpectedFindings: [],
    confidenceAlignment: [],
    recommendedStartingPointSkillId: null,
    recommendedStartingPointReason: "No clear focus area emerged from this diagnostic.",
    aiNarrative: null,
    aiGenerationStatus: "NOT_ATTEMPTED",
    completedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AI narrative generation", () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  it("falls back to a complete deterministic narrative when no API key is configured — the student never sees a failure", async () => {
    const { narrative, status } = await generateAiNarrative(fakeResult());
    expect(status).toBe("FALLBACK");
    expect(narrative.overallSummary.length).toBeGreaterThan(10);
    expect(narrative.strengthsNarrative).toContain("Number Systems");
    expect(narrative.encouragement.length).toBeGreaterThan(5);
  });

  it("produces sensible deterministic text even with no strengths, focus areas, or root causes found", () => {
    const narrative = buildDeterministicNarrative(fakeResult({ strengths: [], focusAreas: [], skillResults: [], possibleRootCauses: [], unexpectedFindings: [] }));
    expect(narrative.strengthsNarrative.length).toBeGreaterThan(5);
    expect(narrative.focusAreasNarrative.length).toBeGreaterThan(5);
    expect(narrative.rootCauseNarrative).toBeNull();
    expect(narrative.surpriseNarrative).toBeNull();
  });

  it("includes root-cause narratives verbatim when present", () => {
    const narrative = buildDeterministicNarrative(
      fakeResult({
        possibleRootCauses: [
          {
            skillId: "Q_PNL",
            skillName: "Profit & Loss",
            relatedSkillId: "Q_PCT_A",
            relatedSkillName: "Percentage Application",
            narrative: "Your Profit & Loss performance appears to be affected by Percentage Application.",
            confidence: "MODERATE",
          },
        ],
      })
    );
    expect(narrative.rootCauseNarrative).toContain("Percentage Application");
  });

  it("joins multiple skill names into readable prose", () => {
    const narrative = buildDeterministicNarrative(
      fakeResult({
        strengths: ["Q_NS"],
        skillResults: [
          { skillId: "Q_NS", skillName: "Number Systems", domain: "QUANTITATIVE", overall: { evidenceLevel: "STRONG", attempts: 3, correct: 3, accuracy: 1, avgResponseTimeMs: 1000 }, foundation: { evidenceLevel: "STRONG", attempts: 3, correct: 3, accuracy: 1, avgResponseTimeMs: 1000 }, application: { evidenceLevel: "NOT_ASSESSED", attempts: 0, correct: 0, accuracy: null, avgResponseTimeMs: null }, transfer: { evidenceLevel: "NOT_ASSESSED", attempts: 0, correct: 0, accuracy: null, avgResponseTimeMs: null } },
        ],
      })
    );
    expect(narrative.strengthsNarrative).toContain("Number Systems");
    expect(narrative.strengthsNarrative).not.toContain("undefined");
  });
});
