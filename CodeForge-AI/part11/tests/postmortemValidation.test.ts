import { describe, it, expect } from "vitest";
import { validatePostmortem } from "@/lib/engine/postmortemValidation";
import { PostmortemRow } from "@/lib/engine/types";

const complete: Partial<PostmortemRow> = {
  summary: "Application submissions failed at an 18% rate for roughly 30 minutes.",
  businessImpact: "18% of submissions failed; deadlines at risk for active applicants.",
  timeline: "Deploy at -21m, declared at -2m, mitigated at +8m, fixed at +15m.",
  rootCause: "Missing index on employers(verification_status) for the new v2.14.0 query.",
  contributingFactors: "Staging performance tests used a dataset far smaller than production.",
  detection: "Alert fired automatically; ownership taken promptly.",
  mitigation: "Rolled back placement-api to v2.13.2.",
  permanentFix: "Deployed v2.14.1 adding the missing composite index.",
  whatWentWell: "Evidence was gathered before acting.",
  whatWentWrong: "The missing index should have been caught by load testing.",
  preventiveActionKeys: ["add_db_index_migration"],
  fiveWhys: ["a", "b", "c", "d", "e"],
};

describe("postmortem validation (brief CRITICAL TEST CASE: invalid postmortem -> validation failure)", () => {
  it("accepts a fully completed postmortem", () => {
    const result = validatePostmortem(complete);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it("rejects an empty postmortem and lists every missing field", () => {
    const result = validatePostmortem({});
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("rootCause");
    expect(result.missingFields).toContain("summary");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects fields that are present but too thin to be substantive", () => {
    const result = validatePostmortem({ ...complete, rootCause: "idk" });
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("rootCause");
  });

  it("requires at least one preventive action", () => {
    const result = validatePostmortem({ ...complete, preventiveActionKeys: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("preventive action"))).toBe(true);
  });

  it("requires at least 3 of the 5 whys completed", () => {
    const result = validatePostmortem({ ...complete, fiveWhys: ["a", "", ""] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("5 whys"))).toBe(true);
  });
});
