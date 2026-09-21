import { describe, it, expect } from "vitest";
import { computeRequirementCoverage } from "../../src/deterministic/requirementCoverage.js";
import { RequirementCoverageStatus, TestOutcome } from "../../src/domain/enums.js";
import { evidence, test as t } from "../fixtures/evidence.js";
import type { Requirement } from "../../src/domain/types.js";

const boundaryReq: Requirement = {
  id: "req-empty-input",
  description: "Handles N = 0 (empty input) without error",
  category: "edge-case",
  relatedTags: ["empty", "boundary"],
};

const orderingReq: Requirement = {
  id: "req-ordering",
  description: "Output preserves input order",
  category: "ordering",
  relatedTags: ["ordering"],
};

describe("computeRequirementCoverage()", () => {
  it("VALIDATED when every related test passes", () => {
    const ev = evidence({
      tests: { totalAvailable: 3, gradingComplete: true, results: [t("t1", TestOutcome.PASS, ["empty"])] },
    });
    const [cov] = computeRequirementCoverage([boundaryReq], ev, []);
    expect(cov!.status).toBe(RequirementCoverageStatus.VALIDATED);
  });

  it("VIOLATED when every related test fails", () => {
    const ev = evidence({
      tests: { totalAvailable: 3, gradingComplete: true, results: [t("t1", TestOutcome.WRONG_ANSWER, ["empty"])] },
    });
    const [cov] = computeRequirementCoverage([boundaryReq], ev, []);
    expect(cov!.status).toBe(RequirementCoverageStatus.VIOLATED);
  });

  it("PARTIALLY_VALIDATED with a genuine mix", () => {
    const ev = evidence({
      tests: {
        totalAvailable: 3,
        gradingComplete: true,
        results: [t("t1", TestOutcome.PASS, ["boundary"]), t("t2", TestOutcome.WRONG_ANSWER, ["empty"])],
      },
    });
    const [cov] = computeRequirementCoverage([boundaryReq], ev, []);
    expect(cov!.status).toBe(RequirementCoverageStatus.PARTIALLY_VALIDATED);
  });

  it("UNKNOWN when no available test exercises the requirement — never guesses", () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS, ["large-n"])] },
    });
    const [cov] = computeRequirementCoverage([orderingReq], ev, []);
    expect(cov!.status).toBe(RequirementCoverageStatus.UNKNOWN);
  });

  it("only marks VALIDATED when actual passing evidence backs it — never on the presence of the requirement alone", () => {
    const ev = evidence({ tests: { totalAvailable: 0, gradingComplete: false, results: [] } });
    const [cov] = computeRequirementCoverage([boundaryReq, orderingReq], ev, []);
    expect(cov!.status).toBe(RequirementCoverageStatus.UNKNOWN);
    expect(cov!.supportingEvidenceIds).toEqual([]);
  });
});
