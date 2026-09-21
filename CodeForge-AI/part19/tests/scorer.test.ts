import { describe, it, expect } from "vitest";
import { computeScore } from "../src/scoring/scorer.js";
import type { Claim, ClaimVerification } from "../src/types.js";

function claim(overrides: Partial<Claim>): Claim {
  return {
    claimId: overrides.claimId ?? "c1",
    claimType: overrides.claimType ?? "ALGORITHM",
    originalText: "text",
    normalizedMeaning: "text",
    importance: overrides.importance ?? "CORE",
    confidence: 0.8,
    ...overrides,
  };
}

function verification(claimId: string, status: ClaimVerification["status"]): ClaimVerification {
  return { claimId, status, confidence: 0.8, evidence: [], explanation: status === "CONTRADICTED" ? "mismatch found" : "ok" };
}

describe("computeScore", () => {
  it("is deterministic for identical input", () => {
    const claims = [claim({ claimId: "a", claimType: "ALGORITHM" }), claim({ claimId: "b", claimType: "COMPLEXITY" })];
    const verifications = [verification("a", "SUPPORTED"), verification("b", "CONTRADICTED")];
    const s1 = computeScore({ claims, verifications, aiAssisted: true });
    const s2 = computeScore({ claims, verifications, aiAssisted: true });
    expect(s1).toEqual(s2);
  });

  it("scores an all-SUPPORTED CORE claim set as STRONG UNDERSTANDING", () => {
    const claims = [
      claim({ claimId: "a", claimType: "ALGORITHM" }),
      claim({ claimId: "b", claimType: "DATA_STRUCTURE" }),
      claim({ claimId: "c", claimType: "COMPLEXITY" }),
    ];
    const verifications = claims.map((c) => verification(c.claimId, "SUPPORTED"));
    const score = computeScore({ claims, verifications, aiAssisted: true });
    expect(score.overall).toBeGreaterThanOrEqual(80);
    expect(score.band).toBe("STRONG UNDERSTANDING");
  });

  it("pulls the Complexity Understanding dimension down when the complexity claim is contradicted, without zeroing unrelated dimensions", () => {
    const claims = [
      claim({ claimId: "algo", claimType: "ALGORITHM", importance: "CORE" }),
      claim({ claimId: "cx", claimType: "COMPLEXITY", importance: "CORE" }),
    ];
    const verifications = [verification("algo", "SUPPORTED"), verification("cx", "CONTRADICTED")];
    const score = computeScore({ claims, verifications, aiAssisted: true });

    const complexityDim = score.dimensions.find((d) => d.dimension === "Complexity Understanding");
    const algoDim = score.dimensions.find((d) => d.dimension === "Algorithm Understanding");
    expect(complexityDim?.score).toBe(0);
    expect(algoDim?.score).toBe(100);
    expect(score.overall).toBeLessThan(100);
    expect(score.overall).toBeGreaterThan(0);
  });

  it("caps confidence at Low when no AI assistance ran", () => {
    const claims = [claim({ claimId: "a" })];
    const verifications = [verification("a", "SUPPORTED")];
    const score = computeScore({ claims, verifications, aiAssisted: false });
    expect(score.confidence).toBe("Low");
  });

  it("handles an empty claim set without throwing", () => {
    const score = computeScore({ claims: [], verifications: [], aiAssisted: true });
    expect(score.overall).toBe(0);
    expect(score.dimensions).toEqual([]);
  });
});
