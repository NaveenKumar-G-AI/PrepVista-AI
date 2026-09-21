import { describe, it, expect, vi } from "vitest";
import { explain } from "../../src/ai/AnthropicAccuracyAdapter.js";

describe("AnthropicAccuracyAdapter — §98-103 fallback behavior", () => {
  it("§101 — with no API key configured, falls back to a deterministic template with no network call", async () => {
    const fetchSpy = vi.fn();
    const result = await explain({ kind: "error_feedback", errorType: "CALCULATION_ERROR" }, { fetchImpl: fetchSpy as never });
    expect(result.source).toBe("fallback");
    expect(result.message.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled(); // no key → never even attempts the call
  });

  it("§130 — AI failure (network error) falls back without throwing", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-fallback-path";
    try {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network down"));
      const result = await explain({ kind: "error_feedback", errorType: "LOGIC_ERROR" }, { fetchImpl: fetchSpy as never });
      expect(result.source).toBe("fallback");
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("§130 — a non-OK HTTP response falls back safely", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-fallback-path";
    try {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
      const result = await explain({ kind: "training_result", beforePct: 78, afterPct: 90 }, { fetchImpl: fetchSpy as never });
      expect(result.source).toBe("fallback");
      expect(result.message).toContain("78");
      expect(result.message).toContain("90");
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("§131 — malformed AI JSON output is rejected safely and falls back", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-fallback-path";
    try {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "not even json" }] })
      } as Response);
      const result = await explain({ kind: "error_feedback", errorType: "UNIT_ERROR" }, { fetchImpl: fetchSpy as never });
      expect(result.source).toBe("fallback");
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("§131 — AI JSON missing the required 'message' field is rejected safely and falls back", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-fallback-path";
    try {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: JSON.stringify({ wrongField: "oops" }) }] })
      } as Response);
      const result = await explain({ kind: "error_feedback", errorType: "UNIT_ERROR" }, { fetchImpl: fetchSpy as never });
      expect(result.source).toBe("fallback");
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("accepts well-formed AI JSON output and ignores any extra/unexpected fields it invents", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-fallback-path";
    try {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "The setup was right; a step later changed the value.",
                intervention_type: "SOMETHING_THE_AI_MADE_UP", // §98/§100 — must be ignored, never trusted
                accuracy: 999
              })
            }
          ]
        })
      } as Response);
      const result = await explain({ kind: "error_feedback", errorType: "CALCULATION_ERROR" }, { fetchImpl: fetchSpy as never });
      expect(result.source).toBe("ai");
      expect(result.message).toBe("The setup was right; a step later changed the value.");
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });
});
