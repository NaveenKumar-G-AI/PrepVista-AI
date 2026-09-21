import { describe, expect, it } from "vitest";
import { AiExtractionService } from "../../src/services/aiExtractionService.js";
import { AnthropicClient } from "../../src/integrations/ai/AnthropicClient.js";

// This sandbox has no valid Anthropic credentials (by design - see
// README "What could not be live-tested"). Rather than skip AI-path
// testing entirely, this test forces a real HTTP round trip to the live
// api.anthropic.com with a deliberately invalid key, so the fallback
// behavior (Section 50: "AI must never become a single point of
// failure") is proven against a genuine API failure, not a mocked one.
describe("AiExtractionService - real API failure triggers the deterministic fallback", () => {
  it("falls back cleanly when the live Anthropic call is rejected (401)", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-deliberately-invalid-for-testing";
    try {
      const service = new AiExtractionService(new AnthropicClient());
      const draft = await service.extract(
        "I have a placement test in 20 days and logical reasoning is my weakest area."
      );
      expect(draft.source).toBe("FALLBACK");
      expect(draft.goalType).toBe("PLACEMENT_READINESS");
      expect(draft.deadlineDays).toBe(20);
      expect(draft.needsClarification).toHaveLength(0);
    } finally {
      process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("never throws out of extract() even on failure - goal creation must keep working", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-deliberately-invalid-for-testing";
    const service = new AiExtractionService(new AnthropicClient());
    await expect(service.extract("I want to improve my speed.")).resolves.toBeDefined();
    process.env.ANTHROPIC_API_KEY = "";
  });
});
