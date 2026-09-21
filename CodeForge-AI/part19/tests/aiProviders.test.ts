import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroqProvider, GeminiProvider } from "../src/ai/groqGeminiProviders.js";
import { scanForInjectionAttempt, wrapUntrustedText } from "../src/ai/promptInjectionGuard.js";
import { MockAIProvider } from "../src/ai/provider.js";
import { REASONING_PROMPT_INJECTION } from "./fixtures.js";

describe("GroqProvider (fetch mocked — no live network)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns AI_PROVIDER_FAILURE when no API key is configured", async () => {
    const provider = new GroqProvider({ apiKey: "" });
    const result = await provider.extractClaims({ reasoningText: "x", ruleBasedHints: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("AI_PROVIDER_FAILURE");
  });

  it("builds an OpenAI-compatible request and parses a well-formed response", async () => {
    const fetchMock = vi.fn(async (url: string, opts: any) => {
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      const body = JSON.parse(opts.body);
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(opts.headers.Authorization).toBe("Bearer test-key");
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ claims: [], confidence: "HIGH" }) } }],
        }),
      };
    });
    global.fetch = fetchMock as any;

    const provider = new GroqProvider({ apiKey: "test-key", model: "test-model" });
    const result = await provider.extractClaims({ reasoningText: "some reasoning", ruleBasedHints: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.confidence).toBe("HIGH");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed response as INVALID_AI_RESPONSE rather than passing it through", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ nonsense: true }) } }] }),
    })) as any;

    const provider = new GroqProvider({ apiKey: "test-key" });
    const result = await provider.extractClaims({ reasoningText: "x", ruleBasedHints: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_AI_RESPONSE");
  });

  it("surfaces a non-2xx response as AI_PROVIDER_FAILURE", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => "server error" })) as any;
    const provider = new GroqProvider({ apiKey: "test-key" });
    const result = await provider.extractClaims({ reasoningText: "x", ruleBasedHints: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("AI_PROVIDER_FAILURE");
  });
});

describe("GeminiProvider (fetch mocked — no live network)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a generateContent request with responseSchema and parses the response", async () => {
    const fetchMock = vi.fn(async (url: string, opts: any) => {
      expect(url).toContain(":generateContent");
      expect(opts.headers["x-goog-api-key"]).toBe("test-key");
      const body = JSON.parse(opts.body);
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ matches: true, confidence: "HIGH", reasoning: "ok" }) }] } }],
        }),
      };
    });
    global.fetch = fetchMock as any;

    const provider = new GeminiProvider({ apiKey: "test-key" });
    const result = await provider.judgeSemanticMatch({ claimText: "hash map", targetConcept: "hashing" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.matches).toBe(true);
  });
});

describe("promptInjectionGuard", () => {
  it("flags an instruction-like override attempt", () => {
    const scan = scanForInjectionAttempt(REASONING_PROMPT_INJECTION);
    expect(scan.flagged).toBe(true);
    expect(scan.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("does not flag ordinary technical reasoning", () => {
    const scan = scanForInjectionAttempt("I used a hash map for O(1) lookup, so the overall time is O(n).");
    expect(scan.flagged).toBe(false);
  });

  it("wraps text with a stable, parseable delimiter", () => {
    const wrapped = wrapUntrustedText("hello");
    expect(wrapped).toContain("<student_submitted_text>");
    expect(wrapped).toContain("hello");
  });
});

describe("MockAIProvider", () => {
  it("passes rule-based hints through unchanged (no fabrication)", async () => {
    const provider = new MockAIProvider();
    const result = await provider.extractClaims({ reasoningText: "x", ruleBasedHints: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.claims).toEqual([]);
  });
});
