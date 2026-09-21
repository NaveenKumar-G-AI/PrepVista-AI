import { describe, it, expect } from "vitest";
import { makeTestBlueprint, NODE } from "../fixtures/blueprintFixture.js";
import {
  runThroughRealPipeline,
  studentA_strongAcrossAllDomains,
  studentB_weakAcrossAllDomains,
  studentC_fastButInaccurate,
  studentD_slowButAccurate,
  studentE_highConfidenceFrequentlyWrong,
  studentF_lowConfidenceFrequentlyCorrect,
  studentG_highlyInconsistent,
  studentH_strongFoundationWeakAdvanced,
  studentI_strongFamiliarWeakNovel,
} from "../fixtures/studentArchetypes.js";
import { DiagnosticSessionService } from "../../src/engine/sessionManager.js";
import { InMemoryDiagnosticRepository } from "../../src/repositories/inMemoryDiagnosticRepository.js";
import { InMemoryQuestionBank } from "../../src/repositories/questionBank.js";
import { deterministicMistakeIntelligence } from "../../src/engine/errorSignals.js";
import { deterministicExplanationProvider } from "../../src/ai/deterministicFallback.js";
import { makeQuestionPool } from "../fixtures/questionPoolFixture.js";

const blueprint = makeTestBlueprint();

describe("Module 55 — Student A: strong across all domains", () => {
  it("reports strong/solid status with high confidence", () => {
    const skillIds = [NODE.percentageBasics, NODE.percentageChange, NODE.ratioBasics, NODE.numberSeriesBasics];
    const profile = runThroughRealPipeline(blueprint, "s1", "student-a", studentA_strongAcrossAllDomains(skillIds));

    expect(["strong", "solid"]).toContain(profile.overallStatus);
    for (const skill of profile.skillProfiles) {
      expect(skill.confidenceState).toBe("high"); // 10 responses >= 2x minEvidenceCount(4)
      expect(["strong", "solid"]).toContain(skill.status);
    }
    expect(profile.strengths.length).toBeGreaterThan(0);
    expect(profile.weaknesses.length).toBe(0);
  });
});

describe("Module 55 — Student B: weak across all domains", () => {
  it("reports needs_focus/developing status, not strong", () => {
    const skillIds = [NODE.percentageBasics, NODE.percentageChange, NODE.ratioBasics, NODE.numberSeriesBasics];
    const profile = runThroughRealPipeline(blueprint, "s2", "student-b", studentB_weakAcrossAllDomains(skillIds));

    expect(["needs_focus", "developing", "insufficient_evidence"]).toContain(profile.overallStatus);
    for (const skill of profile.skillProfiles) {
      expect(["needs_focus", "developing"]).toContain(skill.status);
    }
    expect(profile.weaknesses.length).toBeGreaterThan(0);
  });
});

describe("Module 55 — Student C: fast but inaccurate", () => {
  it("shows fast_wrong as the dominant timing pattern and low accuracy at the domain level", () => {
    const profile = runThroughRealPipeline(blueprint, "s3", "student-c", studentC_fastButInaccurate(NODE.percentageBasics));

    const quantSpeed = profile.speedProfile.find((s) => s.scopeNodeId === NODE.quant)!;
    expect(quantSpeed.label).toBe("fast");

    const quantAccuracy = profile.accuracyProfile.find((a) => a.scopeNodeId === NODE.quant)!;
    expect(quantAccuracy.accuracy).toBeLessThan(0.5);

    // evidence weight should be discounted for the implausibly-fast wrong answers
    const skillEstimate = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    expect(skillEstimate.status).not.toBe("strong");
  });
});

describe("Module 55 — Student D: slow but accurate", () => {
  it("shows slow timing but strong accuracy — different from Student C despite both being 'below strong'", () => {
    const profile = runThroughRealPipeline(blueprint, "s4", "student-d", studentD_slowButAccurate(NODE.percentageBasics));

    const quantSpeed = profile.speedProfile.find((s) => s.scopeNodeId === NODE.quant)!;
    expect(quantSpeed.label).toBe("slow");

    const quantAccuracy = profile.accuracyProfile.find((a) => a.scopeNodeId === NODE.quant)!;
    expect(quantAccuracy.accuracy).toBeGreaterThan(0.7);
  });
});

describe("Module 55 — Student E: high confidence but frequently wrong (overconfidence)", () => {
  it("flags the overconfident calibration pattern", () => {
    const profile = runThroughRealPipeline(blueprint, "s5", "student-e", studentE_highConfidenceFrequentlyWrong(NODE.percentageBasics));
    const quantCalibration = profile.confidenceCalibration.find((c) => c.scopeNodeId === NODE.quant)!;
    expect(quantCalibration.pattern).toBe("overconfident");
    expect(quantCalibration.highConfidenceWrongRate).toBeGreaterThan(0.4);
  });
});

describe("Module 55 — Student F: low confidence but frequently correct (underconfidence)", () => {
  it("flags the underconfident calibration pattern — distinct from Student E, not just 'miscalibrated'", () => {
    const profile = runThroughRealPipeline(blueprint, "s6", "student-f", studentF_lowConfidenceFrequentlyCorrect(NODE.percentageBasics));
    const quantCalibration = profile.confidenceCalibration.find((c) => c.scopeNodeId === NODE.quant)!;
    expect(quantCalibration.pattern).toBe("underconfident");
    expect(quantCalibration.lowConfidenceCorrectRate).toBeGreaterThan(0.6);
  });
});

describe("Module 55 — Student G: highly inconsistent", () => {
  it("is flagged CONFLICTED, not averaged into a flat mid-range score", () => {
    const profile = runThroughRealPipeline(blueprint, "s7", "student-g", studentG_highlyInconsistent(NODE.percentageBasics));

    const skillEstimate = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    expect(skillEstimate.consistencyFlag).toBe(true);
    expect(skillEstimate.confidenceState).toBe("conflicted");

    const consistencyResult = profile.consistency.find((c) => c.skillNodeId === NODE.percentageBasics)!;
    expect(consistencyResult.isConsistent).toBe(false);
  });
});

describe("Module 55 — Student H: strong foundation, weak advanced application", () => {
  it("detects a real difficulty boundary rather than reporting one flat score", () => {
    const profile = runThroughRealPipeline(blueprint, "s8", "student-h", studentH_strongFoundationWeakAdvanced(NODE.percentageBasics));

    const quantBoundary = profile.difficultyBoundaries.find((b) => b.domainOrTopicNodeId === NODE.quant)!;
    expect(quantBoundary.boundaryDetected).toBe(true);
    expect(quantBoundary.accuracyByDifficulty.easy).toBeGreaterThan(0.8);
    expect(quantBoundary.accuracyByDifficulty.hard).toBeLessThan(0.5);
  });
});

describe("Module 55 — Student I: strong on familiar questions, weak on novel ones", () => {
  it("down-weights repeated-exposure evidence rather than treating it as equal independent mastery", () => {
    const profile = runThroughRealPipeline(blueprint, "s9", "student-i", studentI_strongFamiliarWeakNovel(NODE.percentageBasics));

    const skillEstimate = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    // Naive raw accuracy would be (6 correct-familiar + ~1.5 correct-novel) / 12 ≈ 62% ("solid").
    // With repeated-exposure evidence down-weighted, the true independent signal should read weaker.
    expect(skillEstimate.status).not.toBe("strong");
    expect(skillEstimate.weightedEvidence).toBeLessThan(skillEstimate.evidenceCount);
  });
});

describe("Module 55 — Student J: leaves halfway and resumes later", () => {
  it("preserves completed responses across a pause/resume cycle and does not restart the diagnostic", async () => {
    const repo = new InMemoryDiagnosticRepository();
    repo.seedBlueprint(blueprint);
    const questionBank = new InMemoryQuestionBank();
    for (const skill of [NODE.percentageBasics, NODE.percentageChange, NODE.ratioBasics, NODE.numberSeriesBasics]) {
      questionBank.seed(makeQuestionPool(skill, 6));
    }
    const service = new DiagnosticSessionService(repo, questionBank, deterministicMistakeIntelligence, deterministicExplanationProvider);
    const ctx = { tenantId: "t1", studentId: "student-j" };

    const { session } = await service.startOrResume(ctx, blueprint.id, "first_diagnostic");

    // Answer 3 questions, then leave.
    for (let i = 0; i < 3; i++) {
      const step = await service.getNextStep(ctx, session.id);
      if (step.done) throw new Error("unexpectedly stopped early");
      await service.submitResponse(ctx, session.id, {
        clientResponseId: `j-resp-${i}`,
        questionId: step.question.id,
        skillNodeId: step.skillNodeId,
        answer: "A",
        isCorrect: true,
        questionDifficulty: step.question.difficulty,
        expectedDurationMs: step.question.expectedTimeMs,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: step.question.expectedTimeMs,
        hintUsed: false,
        attemptNumber: 1,
        wasPreviouslyExposed: false,
      });
    }

    const pauseResult = await service.pause(ctx, session.id);
    expect(pauseResult.ok).toBe(true);

    const stateWhilePaused = await repo.getSessionState(ctx, session.id);
    expect(stateWhilePaused?.status).toBe("paused");
    expect(stateWhilePaused?.responseCount).toBe(3);

    // "leaves halfway" — cannot submit while paused
    const blockedSubmit = await service.submitResponse(ctx, session.id, {
      clientResponseId: "should-be-blocked",
      questionId: "irrelevant",
      skillNodeId: NODE.percentageBasics,
      answer: "A",
      isCorrect: true,
      questionDifficulty: "easy",
      expectedDurationMs: 20000,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 20000,
      hintUsed: false,
      attemptNumber: 1,
      wasPreviouslyExposed: false,
    });
    expect(blockedSubmit.ok).toBe(false);

    // resumes later
    const resumeResult = await service.resume(ctx, session.id);
    expect(resumeResult.ok).toBe(true);

    const stateAfterResume = await repo.getSessionState(ctx, session.id);
    expect(stateAfterResume?.status).toBe("in_progress");
    expect(stateAfterResume?.responseCount).toBe(3); // the 3 pre-pause responses were never lost

    // and can keep answering without restarting
    const nextStep = await service.getNextStep(ctx, session.id);
    expect(nextStep.done).toBe(false);
  });
});
