import { describe, it, expect } from "vitest";
import { validateAndGround } from "../../src/ai/responseValidator.js";
import { CorrectnessStatus, ConfidenceLevel } from "../../src/domain/enums.js";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    statusAssessment: CorrectnessStatus.PARTIALLY_VALIDATED,
    explanationConfidence: ConfidenceLevel.MEDIUM,
    summary: "The implementation fails on boundary cases.",
    findings: [{ claim: "Loop skips the last element.", evidenceIds: ["cluster-boundary"], confidence: ConfidenceLevel.MEDIUM }],
    requirementNotes: [],
    rootCause: { layer: "implementation", description: "Off-by-one in loop bound.", affectedRegions: [] },
    recommendedNextAction: "Check whether every valid index is processed.",
    ...overrides,
  };
}

describe("validateAndGround()", () => {
  it("accepts a well-formed, schema-valid response", () => {
    const r = validateAndGround(JSON.stringify(validPayload()), ["cluster-boundary"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.summary).toContain("boundary");
      expect(r.droppedFindings).toBe(0);
    }
  });

  it("rejects malformed JSON entirely (no best-effort parsing)", () => {
    const r = validateAndGround("{ this is not json", ["cluster-boundary"]);
    expect(r.ok).toBe(false);
  });

  it("rejects a response missing required fields", () => {
    const payload = validPayload();
    delete (payload as any).recommendedNextAction;
    const r = validateAndGround(JSON.stringify(payload), ["cluster-boundary"]);
    expect(r.ok).toBe(false);
  });

  it("rejects a response with an invalid enum value (e.g. a made-up status)", () => {
    const payload = validPayload({ statusAssessment: "SUPER_DUPER_CORRECT" });
    const r = validateAndGround(JSON.stringify(payload), ["cluster-boundary"]);
    expect(r.ok).toBe(false);
  });

  it("rejects extra/unexpected fields (strict schema)", () => {
    const payload = { ...validPayload(), unexpectedField: "should not be here" };
    const r = validateAndGround(JSON.stringify(payload), ["cluster-boundary"]);
    expect(r.ok).toBe(false);
  });

  it("strips ```json code fences defensively before parsing", () => {
    const fenced = "```json\n" + JSON.stringify(validPayload()) + "\n```";
    const r = validateAndGround(fenced, ["cluster-boundary"]);
    expect(r.ok).toBe(true);
  });

  it("DROPS a finding that cites an evidence id never offered to the model (hallucinated evidence)", () => {
    const payload = validPayload({
      findings: [
        { claim: "Real finding.", evidenceIds: ["cluster-boundary"], confidence: ConfidenceLevel.HIGH },
        { claim: "Fabricated finding citing evidence that does not exist.", evidenceIds: ["totally-made-up-id"], confidence: ConfidenceLevel.HIGH },
      ],
    });
    const r = validateAndGround(JSON.stringify(payload), ["cluster-boundary"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.findings).toHaveLength(1);
      expect(r.result.findings[0]!.claim).toBe("Real finding.");
      expect(r.droppedFindings).toBe(1);
    }
  });

  it("downgrades confidence to LOW when a finding mixes real and fabricated evidence ids, rather than trusting the model's self-reported confidence", () => {
    const payload = validPayload({
      findings: [
        {
          claim: "Partially grounded claim.",
          evidenceIds: ["cluster-boundary", "fake-id-123"],
          confidence: ConfidenceLevel.HIGH, // model claims HIGH
        },
      ],
    });
    const r = validateAndGround(JSON.stringify(payload), ["cluster-boundary"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.findings[0]!.confidence).toBe(ConfidenceLevel.LOW); // overridden, not trusted
      expect(r.result.findings[0]!.evidenceIds).toEqual(["cluster-boundary"]); // fake id stripped
    }
  });

  it("never lets the AI's statusAssessment leak into anything treated as authoritative by this function's contract (only recorded)", () => {
    const payload = validPayload({ statusAssessment: CorrectnessStatus.ACCEPTED });
    const r = validateAndGround(JSON.stringify(payload), ["cluster-boundary"]);
    expect(r.ok).toBe(true);
    // validateAndGround has no concept of "authoritative status" at all —
    // it only ever returns statusAssessment as advisory data. Enforcement
    // that this never becomes the real status lives in orchestrator.ts
    // and is covered by test/ai/promptInjection.test.ts.
    if (r.ok) expect(r.result.statusAssessment).toBe(CorrectnessStatus.ACCEPTED);
  });
});
