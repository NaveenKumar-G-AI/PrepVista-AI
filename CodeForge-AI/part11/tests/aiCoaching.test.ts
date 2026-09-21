import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateCoaching, buildCoachingBundle } from "@/lib/engine/aiCoaching";
import { PF2048_TEMPLATE } from "@/content/incidents/pf-2048";
import { EvaluationResult } from "@/lib/engine/types";

const sampleEvaluation: EvaluationResult = {
  incidentId: "inst-1",
  version: 1,
  categoryScores: {
    detection: 88,
    investigation: 81,
    evidenceQuality: 91,
    rootCause: 76,
    mitigation: 94,
    permanentFix: 83,
    communication: 72,
    prevention: 69,
  },
  engineeringJudgment: 81,
  overall: 82,
  topStrength: "Safe, effective mitigation",
  topGap: "Preventive engineering",
  nextRecommendation: "Database performance regression simulation",
  independence: {
    hintsUsed: 0,
    assistanceModesUsed: [],
    rootCauseRevealed: false,
    aiCallsMade: 0,
    independentInvestigationRatio: 1,
  },
  aiFeedback: null,
};

describe("AI coaching (brief CRITICAL TEST CASE: AI unavailable -> core simulation continues)", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns a templated fallback instead of throwing when no provider key is configured", async () => {
    const bundle = buildCoachingBundle(PF2048_TEMPLATE, sampleEvaluation, true, "ROLLBACK", "DEPLOY_FIX", true, 5);
    const feedback = await generateCoaching(bundle);
    expect(feedback.source).toBe("fallback");
    expect(feedback.sections.length).toBeGreaterThan(0);
    for (const s of feedback.sections) {
      expect(s.observation.length).toBeGreaterThan(0);
      expect(s.recommendation.length).toBeGreaterThan(0);
    }
  });

  it("fallback feedback references the actual weakest/strongest category, not a generic platitude", async () => {
    const bundle = buildCoachingBundle(PF2048_TEMPLATE, sampleEvaluation, true, "ROLLBACK", "DEPLOY_FIX", true, 5);
    const feedback = await generateCoaching(bundle);
    const allText = feedback.sections.map((s) => Object.values(s).join(" ")).join(" ");
    expect(allText).toMatch(/prevention/i); // the weakest category in sampleEvaluation
  });

  it("degrades gracefully (no throw) if the configured provider returns a network error", async () => {
    process.env.GROQ_API_KEY = "test-key-that-will-fail";
    process.env.AI_PROVIDER = "groq";
    // No network access to api.groq.com from this environment/allowlist —
    // this exercises the real failure path, not a mocked one.
    const bundle = buildCoachingBundle(PF2048_TEMPLATE, sampleEvaluation, false, null, null, false, 0);
    const feedback = await generateCoaching(bundle);
    expect(["ai", "fallback"]).toContain(feedback.source);
    expect(feedback.sections.length).toBeGreaterThan(0);
  });
});
