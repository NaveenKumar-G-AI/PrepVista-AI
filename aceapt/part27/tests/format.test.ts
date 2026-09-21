import { describe, expect, it } from "vitest";
import { EmploymentClaimError, formatPercent, formatRange, guardAgainstEmploymentClaims } from "../src/utils/format.js";

describe("formatPercent / formatRange", () => {
  it("always rounds to a whole number — never fake precision (spec section 17)", () => {
    expect(formatPercent(79.284)).toBe("79%");
    expect(formatRange({ low: 77.6, high: 80.5 })).toBe("78\u201381%");
  });

  it("clamps out-of-range values", () => {
    expect(formatPercent(-5)).toBe("0%");
    expect(formatPercent(104)).toBe("100%");
  });
});

describe("guardAgainstEmploymentClaims", () => {
  it("allows ordinary capability-readiness language", () => {
    expect(() =>
      guardAgainstEmploymentClaims("Your transfer score is 14 points below target, based on recent assessments."),
    ).not.toThrow();
  });

  it("blocks an explicit placement-chance claim (spec section 19)", () => {
    expect(() => guardAgainstEmploymentClaims("You have an 87% chance of getting placed.")).toThrow(EmploymentClaimError);
  });

  it("blocks a claim about clearing a specific company's process (spec section 19's own example)", () => {
    expect(() => guardAgainstEmploymentClaims("You will clear TCS with this trajectory.")).toThrow(EmploymentClaimError);
  });

  it("blocks a guaranteed-job claim", () => {
    expect(() => guardAgainstEmploymentClaims("This plan guarantees a job offer.")).toThrow(EmploymentClaimError);
  });
});
