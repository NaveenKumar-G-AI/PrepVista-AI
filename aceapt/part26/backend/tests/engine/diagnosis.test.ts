import { describe, expect, it } from "vitest";
import { seedEvidence } from "../../src/db/seed";
import { computeAllCapabilityStates } from "../../src/engine/state";
import { diagnoseAllTopics } from "../../src/engine/diagnosis";
import { BottleneckType } from "../../src/types";

function diagnosisFor(topicId: string) {
  const states = computeAllCapabilityStates(seedEvidence());
  const diagnoses = diagnoseAllTopics(states);
  const d = diagnoses.find((x) => x.topicId === topicId);
  if (!d) throw new Error(`No diagnosis for ${topicId}`);
  return d;
}

describe("diagnoseTopic - one bottleneck type per seeded scenario", () => {
  const expected: Record<string, BottleneckType> = {
    percentages: "TRANSFER_GAP", // section 9: strong mastery/retention, weak transfer
    probability: "RETENTION_DECAY", // section 10: retention gap, transfer unknown
    "time-and-work": "SPEED_LIMIT", // accurate but slow
    averages: "STABLE", // section 11: everything strong
    "algebra-basics": "CONCEPT_GAP", // plain weak concept, no weak prerequisite of its own
    "quadratic-equations": "PREREQUISITE_GAP", // section 27: weak topic, weaker prerequisite
    "profit-loss": "LOW_EVIDENCE", // section 18: too little data (sampleSize 2)
    "ratio-proportion": "METHOD_ERROR" // section 22: recurring wrong-method tag
  };

  for (const [topicId, bottleneck] of Object.entries(expected)) {
    it(`diagnoses ${topicId} as ${bottleneck}`, () => {
      expect(diagnosisFor(topicId).bottleneck).toBe(bottleneck);
    });
  }

  it("never diagnoses a topic as weak just because one metric dipped, without evidence backing it", () => {
    const d = diagnosisFor("percentages");
    // Percentages has strong mastery/retention (94/91) - the diagnosis must
    // not claim a concept gap despite the transfer weakness.
    expect(d.bottleneck).not.toBe("CONCEPT_GAP");
  });

  it("redirects the prerequisite-gap action to the actual weak prerequisite, not the surface topic", () => {
    const d = diagnosisFor("quadratic-equations");
    expect(d.redirectTopicId).toBe("algebra-basics");
  });

  it("does not evaluate a transfer gap when transfer evidence is unknown (section 10)", () => {
    const d = diagnosisFor("probability");
    expect(d.bottleneck).not.toBe("TRANSFER_GAP");
  });

  it("does not treat a single-attempt topic as confidently diagnosable", () => {
    const d = diagnosisFor("profit-loss");
    expect(d.confidence).toBe("LOW");
  });
});
