import { describe, expect, it } from "vitest";
import {
  detectFailureBoundary,
  detectFamiliarityGap,
  detectPracticeAssessmentGap,
} from "../src/engines/practiceAssessmentGapEngine.js";

describe("detectPracticeAssessmentGap", () => {
  it("flags a significant gap using the spec's own worked example (section 27)", () => {
    const result = detectPracticeAssessmentGap(91, 74);
    expect(result.hasSignificantGap).toBe(true);
    expect(result.gap).toBe(17);
  });

  it("does not flag an ordinary small gap", () => {
    expect(detectPracticeAssessmentGap(80, 76).hasSignificantGap).toBe(false);
  });
});

describe("detectFamiliarityGap", () => {
  it("flags a significant familiar-vs-novel gap using the spec's own worked example (section 29)", () => {
    expect(detectFamiliarityGap(92, 63).hasSignificantGap).toBe(true);
  });
});

describe("detectFailureBoundary", () => {
  it("classifies the spec's own worked example (section 28) as COMBINED novelty + time pressure", () => {
    const result = detectFailureBoundary([
      { stage: "NORMAL", score: 91 },
      { stage: "MIXED", score: 86 },
      { stage: "NOVEL", score: 77 },
      { stage: "TIMED", score: 69 },
      { stage: "SIMULATION", score: 63 },
    ]);
    expect(result.classification).toBe("COMBINED");
  });

  it("classifies a drop concentrated at the novelty stage, with timing barely mattering, as NOVELTY", () => {
    const result = detectFailureBoundary([
      { stage: "NORMAL", score: 90 },
      { stage: "NOVEL", score: 70 },
      { stage: "TIMED", score: 68 },
    ]);
    expect(result.classification).toBe("NOVELTY");
  });

  it("classifies a drop concentrated at the timed stage, with novelty barely mattering, as TIME_PRESSURE", () => {
    const result = detectFailureBoundary([
      { stage: "NORMAL", score: 90 },
      { stage: "NOVEL", score: 88 },
      { stage: "TIMED", score: 70 },
    ]);
    expect(result.classification).toBe("TIME_PRESSURE");
  });

  it("classifies a small overall drop as STABLE — capability holds up", () => {
    const result = detectFailureBoundary([
      { stage: "NORMAL", score: 90 },
      { stage: "NOVEL", score: 86 },
      { stage: "TIMED", score: 84 },
    ]);
    expect(result.classification).toBe("STABLE");
  });

  it("returns INSUFFICIENT_DATA with fewer than two stages", () => {
    expect(detectFailureBoundary([{ stage: "NORMAL", score: 90 }]).classification).toBe("INSUFFICIENT_DATA");
  });
});
