import { describe, expect, it } from "vitest";
import { safeParseAiOutput } from "../src/ai/outputValidator";

describe("safeParseAiOutput", () => {
  it("parses a valid contract object", () => {
    const result = safeParseAiOutput('{"action":"ASK","message":"Which value did you start with?"}');
    expect(result).not.toBeNull();
    expect(result?.action).toBe("ASK");
  });

  it("strips markdown code fences before parsing", () => {
    const result = safeParseAiOutput('```json\n{"action":"HINT","message":"Think about the starting value."}\n```');
    expect(result?.action).toBe("HINT");
  });

  it("rejects output missing the required action field", () => {
    const result = safeParseAiOutput('{"message":"no action here"}');
    expect(result).toBeNull();
  });

  it("rejects an action value outside the allowed enum", () => {
    const result = safeParseAiOutput('{"action":"DELETE_DATABASE","message":"oops"}');
    expect(result).toBeNull();
  });

  it("rejects a helpLevel outside the 0-6 range", () => {
    const result = safeParseAiOutput('{"action":"HINT","message":"x","helpLevel":9}');
    expect(result).toBeNull();
  });

  it("rejects non-JSON text entirely rather than throwing", () => {
    expect(() => safeParseAiOutput("Sure! Here's a hint for you...")).not.toThrow();
    expect(safeParseAiOutput("Sure! Here's a hint for you...")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(safeParseAiOutput("")).toBeNull();
  });
});
