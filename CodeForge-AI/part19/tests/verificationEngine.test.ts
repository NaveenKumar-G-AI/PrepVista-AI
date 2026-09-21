import { describe, it, expect } from "vitest";
import { runVerification } from "../src/verification/verificationEngine.js";
import { extractClaimsRuleBased } from "../src/claims/claimExtractor.js";
import { MockAIProvider } from "../src/ai/provider.js";
import {
  TWO_SUM_HASHMAP,
  PAIR_SUM_NESTED,
  REASONING_TWO_SUM_CORRECT,
  REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC,
} from "./fixtures.js";

describe("runVerification — strong-understanding scenario (hashmap two-sum)", () => {
  it("supports the algorithm, data-structure, and complexity claims", async () => {
    const claims = extractClaimsRuleBased(REASONING_TWO_SUM_CORRECT);
    const result = await runVerification({ claims, sourceCode: TWO_SUM_HASHMAP, aiProvider: new MockAIProvider() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const algo = claims.find((c) => c.claimType === "ALGORITHM");
    const ds = claims.find((c) => c.claimType === "DATA_STRUCTURE");
    const complexity = claims.find((c) => c.claimType === "COMPLEXITY" && /O\(n\)/.test(c.originalText));

    const statusFor = (claimId: string | undefined) => result.value.verifications.find((v) => v.claimId === claimId)?.status;

    expect(statusFor(algo?.claimId)).toBe("SUPPORTED");
    expect(statusFor(ds?.claimId)).toBe("SUPPORTED");
    expect(statusFor(complexity?.claimId)).toBe("SUPPORTED");
    expect(result.value.contradictions.filter((c) => c.severity === "HIGH")).toHaveLength(0);
  });
});

describe("runVerification — flagship mismatch scenario (claimed O(n), actual O(n^2))", () => {
  it("contradicts the complexity claim with concrete evidence and a HIGH-severity contradiction", async () => {
    const claims = extractClaimsRuleBased(REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC);
    const result = await runVerification({ claims, sourceCode: PAIR_SUM_NESTED, aiProvider: new MockAIProvider() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.complexity.time).toBe("O(n^2)");

    const complexityClaim = claims.find((c) => c.claimType === "COMPLEXITY");
    expect(complexityClaim).toBeDefined();
    const v = result.value.verifications.find((v) => v.claimId === complexityClaim!.claimId);
    expect(v?.status).toBe("CONTRADICTED");
    expect(v?.explanation).toMatch(/O\(n\^2\)/);

    const contradiction = result.value.contradictions.find((c) => c.category === "COMPLEXITY_MISMATCH");
    expect(contradiction).toBeDefined();
    expect(contradiction!.severity).toBe("HIGH");
    expect(contradiction!.studentClaim).toMatch(/O\(n\)/);
  });

  it("is deterministic across repeated runs on identical input", async () => {
    const claims = extractClaimsRuleBased(REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC);
    const run = () => runVerification({ claims, sourceCode: PAIR_SUM_NESTED, aiProvider: new MockAIProvider() });
    const a = await run();
    const b = await run();
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.verifications.map((v) => v.status)).toEqual(b.value.verifications.map((v) => v.status));
      expect(a.value.complexity).toEqual(b.value.complexity);
    }
  });
});

describe("runVerification — failure handling", () => {
  it("returns PARSER_FAILURE instead of throwing for unparsable source", async () => {
    const result = await runVerification({ claims: [], sourceCode: "function( {{{ not valid", aiProvider: new MockAIProvider() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PARSER_FAILURE");
  });
});
