import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";

const BAND_RANGES: Record<string, [number, number]> = {
  EASY: [0, 0.4],
  MEDIUM: [0.4, 0.7],
  HARD: [0.7, 1.0]
};

export class DifficultyValidator implements Validator {
  readonly name = "DIFFICULTY_VALIDATOR";
  readonly category = "DIFFICULTY" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["SKILL_VALIDATOR"];

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const { band, numericValue } = q.difficulty;

    if (numericValue !== undefined) {
      const [lo, hi] = BAND_RANGES[band]!;
      if (numericValue < lo || numericValue > hi) {
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "FAIL",
          severity: "MEDIUM",
          code: "DIFFICULTY_METADATA_INVALID",
          message: `Difficulty band "${band}" expects a numeric value in [${lo}, ${hi}], but numericValue is ${numericValue}.`,
          evidence: { band, numericValue, expectedRange: [lo, hi] },
          validatorVersion: this.version,
          startedAt
        });
      }
    }

    // Structural-complexity plausibility heuristic (spec §56) — informational
    // only; Feature 55 owns real empirical calibration.
    const complexityScore =
      (q.solution?.steps.length ?? 0) +
      (q.derivation?.csp ? q.derivation.csp.entities.length * Object.keys(q.derivation.csp.attributes).length * 0.5 : 0) +
      (q.options?.length ?? 0) / 4;

    if (band === "EASY" && complexityScore > 6) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS_WITH_WARNING",
        severity: "LOW",
        code: "DIFFICULTY_IMPLAUSIBLE",
        message: `Declared difficulty is EASY, but structural complexity (${complexityScore.toFixed(1)}) looks high for that band — a heuristic signal, not a verdict (Feature 55 remains canonical).`,
        evidence: { band, complexityScore },
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
      message: "Difficulty metadata is structurally valid.",
      evidence: { band, numericValue, complexityScore },
      validatorVersion: this.version,
      startedAt
    });
  }
}
