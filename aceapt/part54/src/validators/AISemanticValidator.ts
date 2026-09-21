import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult, Severity } from "../contracts/types.js";
import type { AIValidatorClient } from "../ai/AIValidatorClient.js";
import { AIUnavailableError, AI_SEMANTIC_OUTPUT_SCHEMA } from "../ai/AIValidatorClient.js";
import { AIOutputParseError } from "../ai/GroqAdapter.js";
import { DeterministicFallbackAIClient } from "../ai/SimulatedAIClient.js";

export class AISemanticValidator implements Validator {
  readonly name = "AI_SEMANTIC_VALIDATOR";
  readonly category = "AI_SEMANTIC" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["SCHEMA_VALIDATOR"];

  constructor(private readonly aiClient: AIValidatorClient = new DeterministicFallbackAIClient()) {}

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;

    // --- 1. Deterministic RC-evidence grounding check (spec §51) — runs
    // regardless of AI availability, and takes priority in the result below,
    // because it's a concrete finding, not a heuristic opinion.
    let rcFailure: { message: string; evidence: Record<string, unknown> } | null = null;
    if (q.passage?.evidenceSpan) {
      const grounded = normalize(q.passage.text).includes(normalize(q.passage.evidenceSpan));
      if (!grounded) {
        rcFailure = {
          message: "The cited evidence span for the correct answer does not appear verbatim in the passage — reading-comprehension answers must be grounded in passage text.",
          evidence: { evidenceSpan: q.passage.evidenceSpan }
        };
      }
    }

    if (rcFailure) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "MEDIUM",
        code: "RC_EVIDENCE_UNGROUNDED",
        message: rcFailure.message,
        evidence: rcFailure.evidence,
        validatorVersion: this.version,
        startedAt
      });
    }

    // --- 2. Bounded AI-assisted semantic pass. §106: questionText is DATA —
    // see ai/AIValidatorClient.ts#buildPrompt for the actual defense. §105:
    // only schema-validated fields (enforced inside the client) ever reach here.
    const answerEvidence = input.context.upstreamResults.get("ANSWER_VALIDATOR")?.evidence;
    try {
      const raw = await this.aiClient.assess({
        questionText: q.questionText,
        answerType: q.answerType,
        optionTexts: q.options?.map((o) => o.text),
        declaredAnswerText: answerEvidence ? String(answerEvidence.normalizedAnswer) : undefined
      });

      // Never trust a client's TypeScript return type alone — that's a
      // compile-time-only guarantee. ANY AIValidatorClient implementation
      // (not just GroqAdapter) gets its output re-validated here, at the
      // point of consumption, before a single field of it becomes evidence.
      const parsed = AI_SEMANTIC_OUTPUT_SCHEMA.safeParse(raw);
      if (!parsed.success) {
        throw new AIOutputParseError(JSON.stringify(raw));
      }
      const result = parsed.data;

      if (result.status === "REVIEW") {
        const severity: Severity = result.severity ?? "MEDIUM";
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "PASS_WITH_WARNING",
          severity,
          code: "AI_REVIEW_SUGGESTED",
          message: `AI semantic review flagged a possible ${result.issueType ?? "issue"}: ${result.evidence ?? "no further detail provided"} (confidence: ${result.confidence ?? "unspecified"}). This is advisory only — it cannot fail the question on its own.`,
          evidence: { issueType: result.issueType, confidence: result.confidence, aiEvidence: result.evidence },
          validatorVersion: this.version,
          startedAt
        });
      }

      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS",
        severity: "NONE",
        code: "VALID",
        message: "No reading-comprehension grounding issues found; AI semantic review found no concerns.",
        validatorVersion: this.version,
        startedAt
      });
    } catch (err) {
      // spec §170: unavailable AI must never look like "reviewed and fine" —
      // it's an honestly-labeled warning, and it can never block eligibility
      // on its own because AI_SEMANTIC_VALIDATOR never appears in a profile's
      // required list.
      const isParseError = err instanceof AIOutputParseError;
      const isUnavailable = err instanceof AIUnavailableError;
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS_WITH_WARNING",
        severity: "LOW",
        code: isParseError ? "AI_OUTPUT_INVALID" : "AI_UNAVAILABLE",
        message: isUnavailable
          ? "AI semantic review is unavailable right now; deterministic validators are unaffected and this question is not blocked on that basis alone."
          : "AI semantic review returned output that didn't match the required structured schema and was discarded.",
        evidence: { errorType: err instanceof Error ? err.name : "unknown" },
        validatorVersion: this.version,
        startedAt
      });
    }
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
