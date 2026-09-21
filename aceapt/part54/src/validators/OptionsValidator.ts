import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult, OptionSnapshot } from "../contracts/types.js";

export class OptionsValidator implements Validator {
  readonly name = "OPTIONS_VALIDATOR";
  readonly category = "OPTIONS" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["ANSWER_VALIDATOR"];

  isApplicable(input: ValidatorInput): boolean {
    return input.questionVersion.answerType === "SINGLE_SELECT" || input.questionVersion.answerType === "MULTI_SELECT";
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const options = q.options ?? [];

    if (options.length < 2) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "OPTION_STRUCTURE_INVALID",
        message: `Select-type questions need at least 2 options; found ${options.length}.`,
        validatorVersion: this.version,
        startedAt
      });
    }

    const ids = options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "OPTION_STRUCTURE_INVALID",
        message: "Two or more options share the same option id.",
        evidence: { ids },
        validatorVersion: this.version,
        startedAt
      });
    }

    const answerResult = input.context.upstreamResults.get("ANSWER_VALIDATOR");
    const normalizedAnswer = answerResult?.evidence.normalizedAnswer;
    const correctIds = new Set(q.answerType === "SINGLE_SELECT" ? [normalizedAnswer as string] : ((normalizedAnswer as string[]) ?? []));

    const missingCorrect = [...correctIds].filter((id) => !ids.includes(id));
    if (missingCorrect.length > 0 || correctIds.size === 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "NO_VALID_OPTION",
        message: "The declared correct answer does not correspond to any existing option.",
        evidence: { missingCorrect: [...correctIds] },
        validatorVersion: this.version,
        startedAt
      });
    }

    // spec §33/§34: group options by an equivalence key so numerically-identical
    // distractors (0.5 / 1/2 / 50%) are caught even when their option TEXT differs.
    const groups = groupByEquivalence(options);
    const groupsWithCorrectOption = groups.filter((g) => g.some((o) => correctIds.has(o.id)));
    const groupsWithOnlyDistractors = groups.filter((g) => g.length > 1 && !g.some((o) => correctIds.has(o.id)));

    if (q.answerType === "SINGLE_SELECT") {
      const correctGroup = groupsWithCorrectOption[0] ?? [];
      if (correctGroup.length > 1) {
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "FAIL",
          severity: "HIGH",
          code: "MULTIPLE_VALID_OPTIONS",
          message: `${correctGroup.length} options are equivalent to the declared correct answer — a single-select question must have exactly one valid option.`,
          evidence: { equivalentOptionIds: correctGroup.map((o) => o.id), equivalentOptionTexts: correctGroup.map((o) => o.text) },
          validatorVersion: this.version,
          startedAt
        });
      }
    }

    if (groupsWithOnlyDistractors.length > 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS_WITH_WARNING",
        severity: "MEDIUM",
        code: "DUPLICATE_OPTION",
        message: "Two or more distractor options are equivalent to each other (same value, different presentation).",
        evidence: { duplicateGroups: groupsWithOnlyDistractors.map((g) => g.map((o) => ({ id: o.id, text: o.text }))) },
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
      message: "Options are well-formed with exactly one correct answer and no unintended duplicates.",
      evidence: { optionCount: options.length, correctOptionIds: [...correctIds] },
      validatorVersion: this.version,
      startedAt
    });
  }
}

/** Groups options that represent the SAME value — by numericValue when present
 *  (catches 0.5 / 1/2 / 50%-style equivalence), else by normalized text. */
function groupByEquivalence(options: OptionSnapshot[]): OptionSnapshot[][] {
  const byKey = new Map<string, OptionSnapshot[]>();
  for (const option of options) {
    const key = option.numericValue !== undefined ? `num:${roundForCompare(option.numericValue)}` : `text:${option.text.trim().toLowerCase()}`;
    const group = byKey.get(key) ?? [];
    group.push(option);
    byKey.set(key, group);
  }
  return [...byKey.values()];
}

function roundForCompare(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}
