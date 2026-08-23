import { describe, it, expect } from "vitest";
import { computeRelationshipHealth } from "../src/services/relationshipHealthService.js";

describe("computeRelationshipHealth", () => {
  it("matches the spec's own worked example almost verbatim", () => {
    // Spec Phase 6: "Last recorded interaction was 21 days ago and one follow-up is overdue." -> COOLING
    const result = computeRelationshipHealth({
      relationshipStage: "CONTACTED",
      daysSinceLastContact: 21,
      overdueFollowupCount: 1,
      openFollowupCount: 1,
    });
    expect(result.health).toBe("COOLING");
    expect(result.reason).toContain("21 days ago");
    expect(result.reason).toContain("1 follow-up is overdue");
  });

  it("INACTIVE stage always reports INACTIVE health regardless of other signals", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "INACTIVE",
      daysSinceLastContact: 1,
      overdueFollowupCount: 0,
      openFollowupCount: 5,
    });
    expect(result.health).toBe("INACTIVE");
  });

  it("no interactions ever recorded is NEUTRAL, not a fabricated STRONG/AT_RISK guess", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "PROSPECT",
      daysSinceLastContact: null,
      overdueFollowupCount: 0,
      openFollowupCount: 0,
    });
    expect(result.health).toBe("NEUTRAL");
    expect(result.reason).toMatch(/no interactions/i);
  });

  it("recent contact with no overdue follow-ups is STRONG", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "HIRING",
      daysSinceLastContact: 3,
      overdueFollowupCount: 0,
      openFollowupCount: 1,
    });
    expect(result.health).toBe("STRONG");
  });

  it("moderately recent contact with no overdue follow-ups is HEALTHY, not STRONG", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "INTERESTED",
      daysSinceLastContact: 15,
      overdueFollowupCount: 0,
      openFollowupCount: 0,
    });
    expect(result.health).toBe("HEALTHY");
  });

  it("multiple overdue follow-ups plus long silence is AT_RISK, worse than COOLING", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "CONTACTED",
      daysSinceLastContact: 50,
      overdueFollowupCount: 2,
      openFollowupCount: 2,
    });
    expect(result.health).toBe("AT_RISK");
  });

  it("long silence with zero overdue follow-ups is COOLING, not AT_RISK — overdue count matters, not just silence", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "INTERESTED",
      daysSinceLastContact: 40,
      overdueFollowupCount: 0,
      openFollowupCount: 0,
    });
    expect(result.health).toBe("COOLING");
  });

  it("every branch returns a reason built only from the numbers it was given (no vague boilerplate)", () => {
    const result = computeRelationshipHealth({
      relationshipStage: "CONTACTED",
      daysSinceLastContact: 8,
      overdueFollowupCount: 0,
      openFollowupCount: 0,
    });
    expect(result.reason).toContain("8");
  });
});
