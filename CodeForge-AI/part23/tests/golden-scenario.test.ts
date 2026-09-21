import { describe, it, expect } from "vitest";
import {
  HandlerContext,
  initCoachSession,
  recordEvidence,
  submitHypothesis,
  updateHypothesisStatus,
  recordExperiment,
  recordRootCause,
  proposeFix,
  markFixApplied,
  recordRegressionResult,
  requestGuidance,
  requestPostmortem,
  getCoachHistory,
} from "../src/api/handlers.js";
import { InMemoryCoachRepository } from "../src/db/repository.js";
import { InMemoryRateLimiter } from "../src/security/rate-limiter.js";
import { AiProvider, FakeProvider } from "../src/ai/providers.js";
import { DebuggingActionType, DebuggingPhase, HypothesisStatus } from "../src/types.js";

/**
 * Runs Section 50's golden scenario end to end against the real handler
 * stack (real repository logic, real domain engines, real orchestrator —
 * only the network-bound AI call and the outside-this-module systems
 * — Feature 22's execution engine, trace capture, etc. — are stand-ins,
 * since no live CodeForge repo/infra was available to integrate against).
 */
async function runGoldenScenario(provider: AiProvider | undefined) {
  const ctx: HandlerContext = {
    userId: "student-1",
    repository: new InMemoryCoachRepository(),
    rateLimiter: new InMemoryRateLimiter(1000, 60_000),
    aiProvider: provider,
  };

  // Broken program: Feature 22 reports a wrong-answer failure with a source
  // location and a trace showing a `pointer` variable overshooting.
  let state = await initCoachSession(ctx, { debuggingSessionId: "feature22-session-golden" });
  state = await recordEvidence(ctx, state.id, {
    evidence: {
      failure: {
        failureType: "WRONG_ANSWER",
        failingInput: "[1,2,3,4]",
        expectedOutput: "4",
        actualOutput: "undefined",
        sourceLocation: { file: "solve.py", line: 14, symbol: "pointer" },
      },
      trace: [
        { step: 1, location: "solve.py:12", variables: { pointer: 3 } },
        { step: 2, location: "solve.py:14", variables: { pointer: 4 } },
      ],
    },
    reproductionStatus: "REPRODUCED",
  });
  expect(state.currentPhase).toBe(DebuggingPhase.HYPOTHESIZE); // evidence-driven catch-up already walked us here

  // Student: "I think the pointer update is wrong."
  const submitted = await submitHypothesis(ctx, state.id, {
    statement: "I think the pointer update is wrong.",
    distinguishingTargets: ["pointer"],
  });
  const hypothesisId = submitted.hypothesisId;
  state = submitted.state;

  // Coach asks for evidence rather than confirming or denying outright.
  const guidance1 = await requestGuidance(ctx, state.id, {});
  expect(guidance1.nextBestAction.question.length).toBeGreaterThan(0);
  expect(guidance1.nextBestAction.recommendedAction).not.toBe(DebuggingActionType.APPLY_FIX); // never jumps straight to a fix

  // Student moves the hypothesis into TESTING, inspects the trace, runs a
  // targeted experiment, and observes the pointer overshoot.
  state = await updateHypothesisStatus(ctx, state.id, { hypothesisId, status: HypothesisStatus.TESTING });
  state = await recordExperiment(ctx, state.id, {
    hypothesisId,
    action: DebuggingActionType.INSPECT_TRACE,
    target: "pointer",
    expectedObservation: "pointer should equal 3 (the last valid index) at the final step",
    actualObservation: "pointer equaled 4, one past the last valid index",
    interpretation: "the update advances pointer before the loop condition is checked, so it overshoots by one",
  });

  // Hypothesis confirmed.
  state = await updateHypothesisStatus(ctx, state.id, {
    hypothesisId,
    status: HypothesisStatus.SUPPORTED,
    resolutionEvidence: "trace confirmed pointer reaches 4 (out of range) before the loop exits",
  });
  expect(state.currentPhase).toBe(DebuggingPhase.ROOT_CAUSE);

  // Root cause, recorded only because a hypothesis is genuinely SUPPORTED.
  state = await recordRootCause(ctx, state.id, "pointer is advanced before the loop's bounds check runs, so it overshoots the last valid index");
  expect(state.currentPhase).toBe(DebuggingPhase.FIX);

  // Student proposes a fix; coach's next guidance should orient toward what must NOT change.
  state = await proposeFix(ctx, state.id, "Check the loop condition before advancing pointer, not after.");
  const guidance2 = await requestGuidance(ctx, state.id, {});
  expect(guidance2.nextBestAction.recommendedAction).toBeDefined();

  // Student applies the fix and runs the regression suite; everything passes.
  state = await markFixApplied(ctx, state.id, { alignsWithRootCause: true });
  state = await recordRegressionResult(ctx, state.id, { passed: true });
  expect(state.currentPhase).toBe(DebuggingPhase.RESOLVED);

  // Postmortem + skill signals.
  const postmortem = await requestPostmortem(ctx, state.id);
  expect(postmortem.rootCause).toContain("overshoots");
  expect(postmortem.rejectedHypotheses).toHaveLength(0); // the one hypothesis formed was correct
  expect(postmortem.regressionResult).toBe("Regression suite passed.");
  expect(postmortem.skillSignals.regressionAwareness).toBeGreaterThan(0.8);
  expect(postmortem.skillSignals.rootCauseReasoning).toBeGreaterThan(0.8);

  const history = await getCoachHistory(ctx, state.id);
  expect(history.recommendations.length).toBeGreaterThanOrEqual(2);

  return { finalState: state, postmortem, guidance1, guidance2 };
}

describe("Golden scenario (Section 50) — AI available and well-behaved", () => {
  it("runs the full reproduce -> hypothesize -> experiment -> root cause -> fix -> verify -> postmortem loop", async () => {
    const provider = new FakeProvider((req) => {
      // A minimally "smart" fake: always recommends the first candidate it was offered.
      const match = req.userPrompt.match(/"topCandidateActions":\s*\[\s*\{\s*"action":\s*"([A-Z_]+)"(?:,\s*"target":\s*"([^"]*)")?/);
      const action = match?.[1] ?? "REPRODUCE_FAILURE";
      const target = match?.[2];
      return JSON.stringify({
        recommendedAction: action,
        target,
        reason: "Selected from the top-ranked deterministic candidates.",
        expectedInformationGain: "HIGH",
        coachingLevel: "QUESTION",
        question: "What evidence would confirm or rule that out?",
        confidence: "MEDIUM",
      });
    });

    const { finalState, postmortem } = await runGoldenScenario(provider);
    expect(finalState.currentPhase).toBe(DebuggingPhase.RESOLVED);
    expect(postmortem.keyLearning).toContain("overshoots");
  });
});

describe("Golden scenario — AI unavailable throughout (Section 42, Section 49's 'AI failure' case)", () => {
  it("completes the entire debugging session on the deterministic engine alone", async () => {
    const { finalState, postmortem, guidance1, guidance2 } = await runGoldenScenario(undefined);
    expect(guidance1.aiAvailable).toBe(false);
    expect(guidance2.aiAvailable).toBe(false);
    expect(finalState.currentPhase).toBe(DebuggingPhase.RESOLVED);
    expect(postmortem.rootCause).toContain("overshoots");
  });
});
