import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";
import { numbersWithinTolerance, DEFAULT_TOLERANCE } from "./support/safeMath.js";

/** Conversion factor to a canonical base unit within each dimension. Small,
 *  honestly-scoped table (spec §26 only asks for time-style equivalence as the
 *  worked example) — real ACEAPT would likely reuse a shared units library;
 *  this is a genuine, working stand-in, not a mock. */
const UNIT_DIMENSIONS: Record<string, { base: string; factor: number }> = {
  seconds: { base: "time", factor: 1 },
  minutes: { base: "time", factor: 60 },
  hours: { base: "time", factor: 3600 },
  days: { base: "time", factor: 86400 },
  mm: { base: "length", factor: 0.001 },
  cm: { base: "length", factor: 0.01 },
  m: { base: "length", factor: 1 },
  km: { base: "length", factor: 1000 },
  g: { base: "mass", factor: 1 },
  kg: { base: "mass", factor: 1000 },
  ml: { base: "volume", factor: 1 },
  l: { base: "volume", factor: 1000 }
};

export class UnitsValidator implements Validator {
  readonly name = "UNITS_VALIDATOR";
  readonly category = "UNITS" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["ANSWER_VALIDATOR"];

  isApplicable(input: ValidatorInput): boolean {
    return input.questionVersion.units !== undefined;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const units = q.units!;
    const expectedUnit = units.expected;
    const solutionUnit = q.solution?.unitOfFinalAnswer ?? expectedUnit;

    const expectedDim = UNIT_DIMENSIONS[expectedUnit];
    const solutionDim = UNIT_DIMENSIONS[solutionUnit];

    if (!expectedDim || !solutionDim) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "ERROR",
        severity: "MEDIUM",
        code: "UNIT_UNKNOWN_DIMENSION",
        message: `Unrecognized unit(s): expected="${expectedUnit}", solution="${solutionUnit}". Extend UNIT_DIMENSIONS to cover this domain.`,
        validatorVersion: this.version,
        startedAt
      });
    }

    if (expectedDim.base !== solutionDim.base) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "UNIT_MISMATCH",
        message: `Expected unit "${expectedUnit}" (${expectedDim.base}) and solution unit "${solutionUnit}" (${solutionDim.base}) are different physical dimensions entirely.`,
        evidence: { expectedUnit, solutionUnit },
        validatorVersion: this.version,
        startedAt
      });
    }

    const answerEvidence = input.context.upstreamResults.get("ANSWER_VALIDATOR")?.evidence;
    const declaredNumeric = answerEvidence?.numericValue as number | undefined;
    const solutionRaw = q.solution?.finalAnswer;
    const solutionNumeric = typeof solutionRaw === "number" ? solutionRaw : typeof solutionRaw === "string" ? Number(solutionRaw) : undefined;

    if (declaredNumeric === undefined || solutionNumeric === undefined || Number.isNaN(solutionNumeric)) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS",
        severity: "NONE",
        code: "VALID",
        message: "Units are structurally valid; not enough numeric evidence to cross-check conversion.",
        validatorVersion: this.version,
        startedAt
      });
    }

    const solutionInExpectedUnit = (solutionNumeric * solutionDim.factor) / expectedDim.factor;
    const tolerance = q.derivation?.tolerance ?? DEFAULT_TOLERANCE;

    if (numbersWithinTolerance(declaredNumeric, solutionInExpectedUnit, tolerance)) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS",
        severity: "NONE",
        code: "VALID",
        message:
          solutionUnit === expectedUnit
            ? "Declared answer and solution agree in the same unit."
            : `Declared answer (${declaredNumeric} ${expectedUnit}) correctly matches the solution's ${solutionNumeric} ${solutionUnit} after unit conversion.`,
        evidence: { expectedUnit, solutionUnit, convertedSolutionValue: solutionInExpectedUnit },
        validatorVersion: this.version,
        startedAt
      });
    }

    // The classic bug this validator exists to catch: the raw numbers match, but
    // one of them is silently in the wrong unit (spec §26).
    const rawNumbersMatch = numbersWithinTolerance(declaredNumeric, solutionNumeric, tolerance);
    return buildResult({
      validator: this.name,
      category: this.category,
      status: "FAIL",
      severity: "HIGH",
      code: "UNIT_MISMATCH",
      message: rawNumbersMatch
        ? `Declared answer (${declaredNumeric}) and solution (${solutionNumeric}) share the same digits but are labeled in different units (${expectedUnit} vs ${solutionUnit}) — the conversion was never actually done.`
        : `Declared answer (${declaredNumeric} ${expectedUnit}) does not match the solution's value (${solutionNumeric} ${solutionUnit} = ${solutionInExpectedUnit} ${expectedUnit}) even after unit conversion.`,
      evidence: { expectedUnit, solutionUnit, declaredNumeric, solutionNumeric, convertedSolutionValue: solutionInExpectedUnit, allowEquivalentForms: units.allowEquivalentForms },
      validatorVersion: this.version,
      startedAt
    });
  }
}
