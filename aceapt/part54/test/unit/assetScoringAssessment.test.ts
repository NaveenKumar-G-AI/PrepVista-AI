import { describe, it, expect } from "vitest";
import { AssetValidator, ScoringCompatibilityValidator, AssessmentCompatibilityValidator } from "../../src/validators/AssetScoringAssessmentValidators.js";
import { baselineSnapshot, makeInput, makePorts } from "../fixtures/baseline.js";

describe("AssetValidator", () => {
  const validator = new AssetValidator();

  it("is NOT_APPLICABLE when there are no assets", () => {
    expect(validator.isApplicable({ questionVersion: baselineSnapshot() } as never)).toBe(false);
  });

  it("FAILs with BROKEN_ASSET when a referenced asset is missing (spec §202)", async () => {
    const snapshot = baselineSnapshot({ assets: [{ ref: "diagram-1", version: "v1", kind: "IMAGE" }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("BROKEN_ASSET");
    expect(result.severity).toBe("HIGH");
  });

  it("PASSes when the referenced asset exists in the asset store", async () => {
    const snapshot = baselineSnapshot({ assets: [{ ref: "diagram-1", version: "v1", kind: "IMAGE" }] });
    const input = makeInput(snapshot);
    (input.context.ports.assetStore as any).seed("diagram-1", "v1");
    const result = await validator.validate(input);
    expect(result.status).toBe("PASS");
  });
});

describe("ScoringCompatibilityValidator", () => {
  const validator = new ScoringCompatibilityValidator();

  it("PASSes for a supported answer type", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
  });
});

describe("AssessmentCompatibilityValidator", () => {
  const validator = new AssessmentCompatibilityValidator();

  it("PASSes when a full solution and calibrated difficulty are present (spec §205)", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
  });

  it("FAILs ASSESSMENT_INCOMPATIBLE when there is no solution attached, even though practice-eligible", async () => {
    const snapshot = baselineSnapshot({ solution: undefined });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("ASSESSMENT_INCOMPATIBLE");
  });

  it("FAILs ASSESSMENT_INCOMPATIBLE when difficulty has no calibrated numeric value", async () => {
    const snapshot = baselineSnapshot({ difficulty: { band: "EASY" } });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("ASSESSMENT_INCOMPATIBLE");
  });
});
