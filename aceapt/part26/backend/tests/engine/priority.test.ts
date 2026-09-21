import { describe, expect, it } from "vitest";
import { seedEvidence } from "../../src/db/seed";
import { computeAllCapabilityStates } from "../../src/engine/state";
import { diagnoseAllTopics } from "../../src/engine/diagnosis";
import { buildCandidateActions } from "../../src/engine/candidateActions";
import { rankCandidates } from "../../src/engine/priority";

function rankedCandidates() {
  const states = computeAllCapabilityStates(seedEvidence());
  const diagnoses = diagnoseAllTopics(states);
  const candidates = buildCandidateActions(diagnoses);
  const statesById = new Map(states.map((s) => [s.topicId, s]));
  return rankCandidates(candidates, statesById);
}

describe("priority engine", () => {
  it("ranks probability's retention repair above percentage's transfer challenge (section 10)", () => {
    const ranked = rankedCandidates();
    const probabilityIdx = ranked.findIndex((c) => c.topicId === "probability");
    const percentagesIdx = ranked.findIndex((c) => c.topicId === "percentages");
    expect(probabilityIdx).toBeGreaterThanOrEqual(0);
    expect(percentagesIdx).toBeGreaterThanOrEqual(0);
    expect(probabilityIdx).toBeLessThan(percentagesIdx);
  });

  it("never produces a candidate for a STABLE topic (section 19 - don't keep testing what's solid)", () => {
    const ranked = rankedCandidates();
    expect(ranked.find((c) => c.topicId === "averages")).toBeUndefined();
  });

  it("keeps every score transparent: the weighted terms sum to the priority score", () => {
    const ranked = rankedCandidates();
    for (const candidate of ranked) {
      const sum = candidate.priorityBreakdown.reduce((acc, t) => acc + t.contribution, 0);
      expect(sum).toBeCloseTo(candidate.priorityScore, 5);
    }
  });

  it("produces at most one candidate per topic even when a topic could arise two ways", () => {
    const ranked = rankedCandidates();
    const topicIds = ranked.map((c) => c.topicId);
    expect(new Set(topicIds).size).toBe(topicIds.length);
  });

  it("scores are always within [0, 1]", () => {
    const ranked = rankedCandidates();
    for (const c of ranked) {
      expect(c.priorityScore).toBeGreaterThanOrEqual(0);
      expect(c.priorityScore).toBeLessThanOrEqual(1);
    }
  });
});
