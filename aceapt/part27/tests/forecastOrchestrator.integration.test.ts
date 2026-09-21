import { describe, expect, it } from "vitest";
import { fixMyReadiness, runForecastPipeline, type ForecastPipelineDeps } from "../src/services/forecastOrchestrator.js";
import { InMemoryPlatformEvidenceGateway } from "../src/integration/inMemoryPlatformEvidenceGateway.js";
import { InMemoryForecastRepository } from "../src/repository/inMemoryForecastRepository.js";
import { MockFeature26AdaptAdapter } from "../src/integration/feature26AdaptAdapter.js";
import { TypedEventBus } from "../src/events/eventBus.js";
import { DEMO_STUDENT_ID, seedDemoFixtures } from "../src/integration/devFixtures.js";

const FIXED_NOW = new Date("2026-08-29T00:00:00.000Z");

function makeDeps(): { deps: ForecastPipelineDeps; gateway: InMemoryPlatformEvidenceGateway } {
  const gateway = new InMemoryPlatformEvidenceGateway();
  seedDemoFixtures(gateway, new Map(), FIXED_NOW);
  const deps: ForecastPipelineDeps = {
    gateway,
    repository: new InMemoryForecastRepository(),
    adaptAdapter: new MockFeature26AdaptAdapter(),
    eventBus: new TypedEventBus(),
    now: () => FIXED_NOW,
  };
  return { deps, gateway };
}

describe("runForecastPipeline (integration)", () => {
  it("produces a complete, internally consistent result for the seeded student", async () => {
    const { deps } = makeDeps();
    const result = await runForecastPipeline(DEMO_STUDENT_ID, deps);

    expect(result.forecast).not.toBeNull();
    expect(result.forecast!.projectedRange.low).toBeLessThanOrEqual(result.forecast!.projectedRange.high);
    expect([
      "NOT_ENOUGH_EVIDENCE",
      "DEVELOPING",
      "AT_RISK",
      "IMPROVING",
      "ON_TRACK",
      "TARGET_REACHED",
      "STABLE",
    ]).toContain(result.status);
    expect(result.whyPanel?.evidence.length ?? 0).toBeGreaterThan(0);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.mainFactor).not.toBeNull();
    // The spec's own worked example (section 28) should surface as a combined boundary.
    expect(result.failureBoundary?.classification).toBe("COMBINED");
    // No fake precision anywhere in the headline numbers.
    expect(Number.isInteger(result.currentOverall)).toBe(true);
  });

  it("is stable across repeated runs against unchanged evidence (no spurious transition)", async () => {
    const { deps } = makeDeps();
    const first = await runForecastPipeline(DEMO_STUDENT_ID, deps);
    const second = await runForecastPipeline(DEMO_STUDENT_ID, deps);
    expect(second.status).toBe(first.status);
    expect(second.transition.changed).toBe(false);
  });

  it("closes the loop: Fix My Readiness -> simulated new evidence -> readiness moves (spec section 34/39)", async () => {
    const { deps, gateway } = makeDeps();
    const before = await runForecastPipeline(DEMO_STUDENT_ID, deps);

    const { plan } = await fixMyReadiness(DEMO_STUDENT_ID, deps);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.focusDimension).toBe(before.mainFactor);

    const focus = before.mainFactor;
    expect(focus).not.toBeNull();
    const currentValue = before.capability.dimensions[focus!]?.value ?? 0;
    gateway.addObservation(DEMO_STUDENT_ID, focus!, {
      date: new Date(FIXED_NOW.getTime() + 86_400_000).toISOString(),
      value: Math.min(100, currentValue + 8),
    });
    gateway.addObservation(DEMO_STUDENT_ID, "overall", {
      date: new Date(FIXED_NOW.getTime() + 86_400_000).toISOString(),
      value: Math.min(100, before.currentOverall + 3),
    });

    const after = await runForecastPipeline(DEMO_STUDENT_ID, deps);
    expect(after.currentOverall).toBeGreaterThan(before.currentOverall);
  });

  it("handles a student with no configured target without throwing, and without inventing a forecast", async () => {
    const gateway = new InMemoryPlatformEvidenceGateway();
    gateway.seedStudent("no-target-student", {
      dimensions: [{ key: "mastery", latestValue: 70, observationCount: 5, lastUpdated: FIXED_NOW.toISOString() }],
      trajectories: {},
      target: null,
      evidenceQuality: {
        observationCount: 5,
        recencyDaysAvg: 5,
        topicDiversity: 0.5,
        difficultyDiversity: 0.5,
        noveltyRatio: 0.3,
        hasTransferEvidence: false,
        hasAssessmentEvidence: true,
        hasTimedEvidence: false,
        historicalStability: 0.5,
        breakdown: { assessments: 1, adaptiveSessions: 3, practiceQuestions: 1 },
      },
      practiceVsAssessment: null,
      familiarityVsNovel: null,
      failureBoundary: null,
      selfReportedConfidence: null,
    });
    const deps: ForecastPipelineDeps = {
      gateway,
      repository: new InMemoryForecastRepository(),
      adaptAdapter: new MockFeature26AdaptAdapter(),
      eventBus: new TypedEventBus(),
      now: () => FIXED_NOW,
    };

    const result = await runForecastPipeline("no-target-student", deps);
    expect(result.forecast).toBeNull();
    expect(result.whyPanel).toBeNull();
    expect(result.status).not.toBe("NOT_ENOUGH_EVIDENCE"); // 5 real observations is enough to not be zero-evidence
  });
});
