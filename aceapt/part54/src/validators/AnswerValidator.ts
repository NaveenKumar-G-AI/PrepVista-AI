import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";
import { extractNumericValue } from "./support/numericAnswer.js";

const NUMERIC_TYPES = new Set(["NUMERIC", "DECIMAL", "FRACTION", "PERCENTAGE"]);

export class AnswerValidator implements Validator {
  readonly name = "ANSWER_VALIDATOR";
  readonly category = "ANSWER" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["SCHEMA_VALIDATOR"];

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const { answerType, answer } = q;

    if (answer === null || answer === undefined || answer === "") {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "ANSWER_STRUCTURE_INVALID",
        message: "No answer is declared for this question version.",
        validatorVersion: this.version,
        startedAt
      });
    }

    // Reuse the SAME normalization the grading engine would apply (spec §28) —
    // approving a question the grader can't interpret is the exact failure mode
    // this validator exists to prevent.
    if (!input.context.ports.scoringNormalizer.supports(answerType)) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "INVALID_ANSWER_TYPE",
        message: `Answer type "${answerType}" is not recognized by the scoring engine.`,
        validatorVersion: this.version,
        startedAt
      });
    }

    const normalization = input.context.ports.scoringNormalizer.normalize(answerType, answer);
    if (!normalization.ok) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "ANSWER_NOT_NORMALIZABLE",
        message: normalization.reason,
        evidence: { declaredAnswer: answer, answerType },
        validatorVersion: this.version,
        startedAt
      });
    }

    // ID resolution against options (spec §22) for select-style answers.
    if ((answerType === "SINGLE_SELECT" || answerType === "MULTI_SELECT") && q.options) {
      const optionIds = new Set(q.options.map((o) => o.id));
      const declaredIds = answerType === "SINGLE_SELECT" ? [normalization.normalized as string] : (normalization.normalized as string[]);
      const unresolved = declaredIds.filter((id) => !optionIds.has(id));
      if (unresolved.length > 0) {
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "FAIL",
          severity: "CRITICAL",
          code: "ANSWER_UNRESOLVABLE_ID",
          message: `Declared answer references option id(s) not present in this question's options: ${unresolved.join(", ")}.`,
          evidence: { unresolved, availableOptionIds: [...optionIds] },
          validatorVersion: this.version,
          startedAt
        });
      }
    }

    const numericExtraction = NUMERIC_TYPES.has(answerType) ? extractNumericValue(answer) : extractSelectedOptionNumericValue(q, normalization.normalized);

    return buildResult({
      validator: this.name,
      category: this.category,
      status: "PASS",
      severity: "NONE",
      code: "VALID",
      message: "Declared answer is structurally valid and normalizable for grading.",
      evidence: {
        normalizedAnswer: normalization.normalized,
        numericValue: numericExtraction?.value,
        wasPercentageLiteral: numericExtraction?.wasPercentageLiteral ?? false
      },
      validatorVersion: this.version,
      startedAt
    });
  }
}

/** For SINGLE_SELECT questions the "numeric value" downstream validators care about
 *  (Math/Options equivalence checks) is the numericValue of the CHOSEN option, not
 *  the option id string itself. */
function extractSelectedOptionNumericValue(
  q: ValidatorInput["questionVersion"],
  normalizedAnswer: unknown
): { value: number; wasPercentageLiteral: boolean } | undefined {
  if (q.answerType !== "SINGLE_SELECT" || !q.options) return undefined;
  const chosen = q.options.find((o) => o.id === normalizedAnswer);
  return chosen?.numericValue !== undefined ? { value: chosen.numericValue, wasPercentageLiteral: false } : undefined;
}
