import { describe, expect, it } from "vitest";
import { AllProvidersUnavailableError, ProviderRouter, tierForLevel } from "@/lib/hint-ladder/providers/router";
import { FakeProvider, fixedJsonResponder } from "@/lib/hint-ladder/providers/fake-provider";

describe("tierForLevel", () => {
  it("uses the fast tier for shallow levels", () => {
    expect(tierForLevel("DIRECTION")).toBe("fast");
    expect(tierForLevel("CONCEPT")).toBe("fast");
  });
  it("uses the strong tier for deeper reasoning levels", () => {
    expect(tierForLevel("TARGETED")).toBe("strong");
    expect(tierForLevel("SPECIFIC")).toBe("strong");
    expect(tierForLevel("DETAILED")).toBe("strong");
    expect(tierForLevel("SOLUTION_ASSISTANCE")).toBe("strong");
  });
});

describe("ProviderRouter", () => {
  it("calls the primary provider first", async () => {
    const primary = new FakeProvider(fixedJsonResponder({ ok: true }));
    const router = new ProviderRouter({ groq: primary }, { primary: "groq", timeoutMs: 5000 });
    const result = await router.generateForLevel("DIRECTION", { systemPrompt: "sys", userPrompt: "user" });
    expect(result.provider).toBe("groq");
    expect(primary.calls.length).toBe(1);
  });

  it("falls back to the secondary provider when the primary fails", async () => {
    const primary = new FakeProvider(fixedJsonResponder({}), { shouldFail: true });
    const secondary = new FakeProvider(fixedJsonResponder({ ok: true }));
    // Both are registered under the router's expected keys.
    const router = new ProviderRouter({ groq: primary, gemini: secondary }, { primary: "groq", timeoutMs: 5000 });
    const result = await router.generateForLevel("CONCEPT", { systemPrompt: "sys", userPrompt: "user" });
    expect(result.rawText).toContain("ok");
    expect(secondary.calls.length).toBe(1);
  });

  it("throws AllProvidersUnavailableError when nothing is configured or working", async () => {
    const router = new ProviderRouter({}, { primary: "groq", timeoutMs: 5000 });
    await expect(router.generateForLevel("DIRECTION", { systemPrompt: "s", userPrompt: "u" })).rejects.toBeInstanceOf(
      AllProvidersUnavailableError
    );
  });
});
