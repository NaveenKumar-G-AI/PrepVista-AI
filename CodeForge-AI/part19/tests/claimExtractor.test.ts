import { describe, it, expect } from "vitest";
import { extractClaims, extractClaimsRuleBased } from "../src/claims/claimExtractor.js";
import { MockAIProvider } from "../src/ai/provider.js";
import {
  REASONING_TWO_SUM_CORRECT,
  REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC,
  REASONING_GENERIC,
  REASONING_PROMPT_INJECTION,
} from "./fixtures.js";

describe("extractClaimsRuleBased", () => {
  it("extracts a data-structure claim and a complexity claim from correct two-sum reasoning", () => {
    const claims = extractClaimsRuleBased(REASONING_TWO_SUM_CORRECT);
    expect(claims.some((c) => c.claimType === "DATA_STRUCTURE")).toBe(true);
    expect(claims.some((c) => c.claimType === "COMPLEXITY" && /O\(n\)/.test(c.originalText))).toBe(true);
  });

  it("extracts the claimed O(n) complexity even when the code is actually quadratic (verification happens later)", () => {
    const claims = extractClaimsRuleBased(REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC);
    const complexity = claims.find((c) => c.claimType === "COMPLEXITY");
    expect(complexity).toBeDefined();
    expect(complexity!.originalText).toMatch(/O\(n\)/);
  });

  it("flags vague phrasing with no concrete backing as generic", () => {
    const claims = extractClaimsRuleBased(REASONING_GENERIC);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.isGeneric)).toBe(true);
  });

  it("does not flag concrete reasoning as generic even if it shares vocabulary with vague phrases", () => {
    const claims = extractClaimsRuleBased(REASONING_TWO_SUM_CORRECT);
    expect(claims.some((c) => c.isGeneric)).toBe(false);
  });

  it("still extracts real, checkable claims from text containing an injection attempt", () => {
    const claims = extractClaimsRuleBased(REASONING_PROMPT_INJECTION);
    const complexity = claims.find((c) => c.claimType === "COMPLEXITY" && /O\(1\)/.test(c.originalText));
    expect(complexity).toBeDefined();
  });

  it("gives every claim a unique id", () => {
    const claims = extractClaimsRuleBased(REASONING_TWO_SUM_CORRECT);
    const ids = new Set(claims.map((c) => c.claimId));
    expect(ids.size).toBe(claims.length);
  });
});

describe("extractClaims (full pipeline)", () => {
  it("returns NO_REASONING for empty input", async () => {
    const result = await extractClaims({ reasoningText: "   ", aiProvider: new MockAIProvider() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_REASONING");
  });

  it("succeeds with aiAssisted:true when the provider succeeds", async () => {
    const result = await extractClaims({ reasoningText: REASONING_TWO_SUM_CORRECT, aiProvider: new MockAIProvider() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.aiAssisted).toBe(true);
  });

  it("degrades gracefully to rule-based claims (aiAssisted:false) when the provider fails", async () => {
    const failingProvider = {
      name: "failing",
      extractClaims: async () => ({ ok: false as const, reason: "AI_PROVIDER_FAILURE" as const, message: "down" }),
      judgeSemanticMatch: async () => ({ ok: false as const, reason: "AI_PROVIDER_FAILURE" as const, message: "down" }),
      phraseFollowUpQuestion: async () => ({ ok: false as const, reason: "AI_PROVIDER_FAILURE" as const, message: "down" }),
    };
    const result = await extractClaims({ reasoningText: REASONING_TWO_SUM_CORRECT, aiProvider: failingProvider });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.aiAssisted).toBe(false);
      expect(result.value.claims.length).toBeGreaterThan(0);
    }
  });
});
