import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";

export class AssetValidator implements Validator {
  readonly name = "ASSET_VALIDATOR";
  readonly category = "ASSETS" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["SCHEMA_VALIDATOR"];

  isApplicable(input: ValidatorInput): boolean {
    return input.questionVersion.assets.length > 0;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const assets = input.questionVersion.assets;
    const broken: { ref: string; version: string }[] = [];

    for (const asset of assets) {
      const exists = await input.context.ports.assetStore.exists(asset.ref, asset.version);
      if (!exists) broken.push({ ref: asset.ref, version: asset.version });
    }

    if (broken.length > 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "HIGH",
        code: "BROKEN_ASSET",
        message: `${broken.length} referenced asset(s) could not be found at their recorded version.`,
        evidence: { broken },
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
      message: "All referenced assets exist at their recorded version.",
      evidence: { assetCount: assets.length },
      validatorVersion: this.version,
      startedAt
    });
  }
}

export class ScoringCompatibilityValidator implements Validator {
  readonly name = "SCORING_COMPATIBILITY_VALIDATOR";
  readonly category = "SCORING" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["ANSWER_VALIDATOR"];

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const answerType = input.questionVersion.answerType;
    const supported = input.context.ports.scoringNormalizer.supports(answerType);

    if (!supported) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "SCORING_INCOMPATIBLE",
        message: `The grading engine has no code path for answer type "${answerType}" yet — this question cannot be scored.`,
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
      message: `Grading engine supports answer type "${answerType}".`,
      validatorVersion: this.version,
      startedAt
    });
  }
}

/** spec §74-78: the strictest gate. By the time this validator's dependencies
 *  have all passed, the question is already known to be intrinsically valid —
 *  this validator asks the NARROWER question of whether it's fit for HIGH-STAKES
 *  use specifically (spec §75: intrinsic validity is kept separate from
 *  contextual/mode eligibility). */
export class AssessmentCompatibilityValidator implements Validator {
  readonly name = "ASSESSMENT_COMPATIBILITY_VALIDATOR";
  readonly category = "ASSESSMENT" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["OPTIONS_VALIDATOR", "SOLUTION_VALIDATOR", "MATH_VALIDATOR", "RUNTIME_VALIDATOR", "SCORING_COMPATIBILITY_VALIDATOR", "DIFFICULTY_VALIDATOR"];

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const problems: string[] = [];

    if (!q.solution) {
      problems.push("No solution is attached — assessment-grade questions must carry a full worked solution.");
    }
    if (q.difficulty.numericValue === undefined) {
      problems.push("No calibrated numeric difficulty is set — assessment eligibility requires more than a coarse EASY/MEDIUM/HARD band.");
    }

    if (problems.length > 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "MEDIUM",
        code: "ASSESSMENT_INCOMPATIBLE",
        message: problems.join(" "),
        evidence: { problems },
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
      message: "Question meets the additional bar required for formal, high-stakes assessment use.",
      validatorVersion: this.version,
      startedAt
    });
  }
}
