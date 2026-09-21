import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult, DerivationSpec } from "../contracts/types.js";
import { safeEvaluate, numbersWithinTolerance, DEFAULT_TOLERANCE } from "./support/safeMath.js";
import { extractNumericValue } from "./support/numericAnswer.js";

const EXPRESSION_DRIVEN_DOMAINS = new Set([
  "ARITHMETIC",
  "PERCENTAGE",
  "RATIO",
  "AVERAGE",
  "PROFIT_LOSS",
  "SIMPLE_INTEREST",
  "COMPOUND_INTEREST",
  "TIME_WORK",
  "SPEED_DISTANCE",
  "ALGEBRA",
  "PERMUTATION_COMBINATION"
]);

export class MathValidator implements Validator {
  readonly name = "MATH_VALIDATOR";
  readonly category = "MATH" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["ANSWER_VALIDATOR"];

  isApplicable(input: ValidatorInput): boolean {
    const d = input.questionVersion.derivation;
    if (!d) return false;
    if (EXPRESSION_DRIVEN_DOMAINS.has(d.domain)) return Boolean(d.expression);
    if (d.domain === "GEOMETRY") return Boolean(d.formula);
    if (d.domain === "PROBABILITY") return Boolean(d.probability);
    if (d.domain === "DATA_INTERPRETATION") return Boolean(d.dataInterpretation);
    return false;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const d = q.derivation as DerivationSpec;
    const tolerance = d.tolerance ?? DEFAULT_TOLERANCE;

    const derived = this.derive(d);
    if (!derived.ok) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "ERROR",
        severity: "MEDIUM",
        code: "MATH_DERIVATION_UNAVAILABLE",
        message: `Could not independently derive an answer for domain ${d.domain}: ${derived.error}`,
        validatorVersion: this.version,
        startedAt
      });
    }

    if (d.domain === "PROBABILITY" && (derived.value < 0 || derived.value > 1)) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "MATH_INVALID",
        message: `Derived probability ${derived.value} is outside the valid range [0, 1].`,
        evidence: { derivedValue: derived.value, domain: d.domain },
        validatorVersion: this.version,
        startedAt
      });
    }

    const answerEvidence = input.context.upstreamResults.get("ANSWER_VALIDATOR")?.evidence;
    const declaredNumeric = (answerEvidence?.numericValue as number | undefined) ?? extractNumericValue(q.answer)?.value;

    if (declaredNumeric === undefined) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "SKIPPED",
        severity: "NONE",
        code: "MATH_DERIVATION_UNAVAILABLE",
        message: "Declared answer has no comparable numeric value for this answer type (e.g. free text) — nothing for MathValidator to cross-check.",
        validatorVersion: this.version,
        startedAt,
        skippedReason: "NON_NUMERIC_ANSWER_TYPE"
      });
    }

    if (!numbersWithinTolerance(declaredNumeric, derived.value, tolerance)) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "MATH_INVALID",
        message: `Declared answer (${declaredNumeric}) does not match the independently derived value (${derived.value}).`,
        evidence: { declaredAnswer: declaredNumeric, derivedAnswer: derived.value, domain: d.domain, trace: derived.trace },
        validatorVersion: this.version,
        startedAt
      });
    }

    // Multi-source consistency (spec §41): declared matches derived, but does the
    // SOLUTION (a third, independent source) also agree?
    const solutionEvidence = input.context.upstreamResults.get("SOLUTION_VALIDATOR");
    const solutionNumeric = solutionEvidence?.status && ["PASS", "PASS_WITH_WARNING"].includes(solutionEvidence.status) ? (solutionEvidence.evidence.finalAnswerNumeric as number | undefined) : undefined;

    if (solutionNumeric !== undefined && !numbersWithinTolerance(solutionNumeric, derived.value, tolerance)) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS_WITH_WARNING",
        severity: "HIGH",
        code: "MULTI_SOURCE_DISAGREEMENT",
        message: `Declared answer agrees with independent derivation (${derived.value}), but the worked solution reaches a different value (${solutionNumeric}) — worth a human look.`,
        evidence: { declaredAnswer: declaredNumeric, derivedAnswer: derived.value, solutionAnswer: solutionNumeric, domain: d.domain },
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
      message: `Declared answer agrees with an independently derived value (${derived.value}) for domain ${d.domain}.`,
      evidence: { derivedAnswer: derived.value, domain: d.domain, trace: derived.trace },
      validatorVersion: this.version,
      startedAt
    });
  }

  private derive(d: DerivationSpec): { ok: true; value: number; trace: string } | { ok: false; error: string } {
    if (EXPRESSION_DRIVEN_DOMAINS.has(d.domain)) {
      if (!d.expression) return { ok: false, error: "No expression provided." };
      const result = safeEvaluate(d.expression, d.variables ?? {});
      return result.ok ? { ok: true, value: result.value, trace: `${d.expression} = ${result.value}` } : { ok: false, error: result.error };
    }

    if (d.domain === "GEOMETRY" && d.formula) {
      return this.deriveGeometry(d.formula);
    }

    if (d.domain === "PROBABILITY" && d.probability) {
      const { favorable, total } = d.probability;
      if (total <= 0) return { ok: false, error: "Total outcome count must be positive." };
      return { ok: true, value: favorable / total, trace: `${favorable} / ${total} = ${favorable / total}` };
    }

    if (d.domain === "DATA_INTERPRETATION" && d.dataInterpretation) {
      return this.deriveDataInterpretation(d.dataInterpretation);
    }

    return { ok: false, error: `Domain ${d.domain} has no derivation inputs.` };
  }

  private deriveGeometry(formula: { name: string; inputs: Record<string, number> }): { ok: true; value: number; trace: string } | { ok: false; error: string } {
    const { name, inputs } = formula;
    const need = (key: string): number | undefined => inputs[key];
    switch (name) {
      case "rectangleArea": {
        const l = need("length");
        const w = need("width");
        if (l === undefined || w === undefined) return { ok: false, error: "rectangleArea needs length and width." };
        return { ok: true, value: l * w, trace: `length(${l}) * width(${w})` };
      }
      case "rectanglePerimeter": {
        const l = need("length");
        const w = need("width");
        if (l === undefined || w === undefined) return { ok: false, error: "rectanglePerimeter needs length and width." };
        return { ok: true, value: 2 * (l + w), trace: `2 * (length(${l}) + width(${w}))` };
      }
      case "triangleArea": {
        const base = need("base");
        const height = need("height");
        if (base === undefined || height === undefined) return { ok: false, error: "triangleArea needs base and height." };
        return { ok: true, value: 0.5 * base * height, trace: `0.5 * base(${base}) * height(${height})` };
      }
      case "trianglePerimeterHeron": {
        const a = need("a");
        const b = need("b");
        const c = need("c");
        if (a === undefined || b === undefined || c === undefined) return { ok: false, error: "trianglePerimeterHeron needs sides a, b, c." };
        return { ok: true, value: a + b + c, trace: `a(${a}) + b(${b}) + c(${c})` };
      }
      case "circleArea": {
        const r = need("radius");
        if (r === undefined) return { ok: false, error: "circleArea needs radius." };
        return { ok: true, value: Math.PI * r * r, trace: `pi * radius(${r})^2` };
      }
      case "circleCircumference": {
        const r = need("radius");
        if (r === undefined) return { ok: false, error: "circleCircumference needs radius." };
        return { ok: true, value: 2 * Math.PI * r, trace: `2 * pi * radius(${r})` };
      }
      default:
        return { ok: false, error: `Unknown geometry formula "${name}".` };
    }
  }

  private deriveDataInterpretation(di: { table: number[][]; operation: string; args?: number[] }): { ok: true; value: number; trace: string } | { ok: false; error: string } {
    const flat = di.table.flat();
    switch (di.operation) {
      case "sum":
        return { ok: true, value: flat.reduce((a, b) => a + b, 0), trace: `sum(${flat.join(",")})` };
      case "average":
        return { ok: true, value: flat.reduce((a, b) => a + b, 0) / flat.length, trace: `average(${flat.join(",")})` };
      case "max":
        return { ok: true, value: Math.max(...flat), trace: `max(${flat.join(",")})` };
      case "min":
        return { ok: true, value: Math.min(...flat), trace: `min(${flat.join(",")})` };
      case "percentageChange": {
        const [rowA, colA, rowB, colB] = di.args ?? [];
        const from = di.table[rowA ?? 0]?.[colA ?? 0];
        const to = di.table[rowB ?? 0]?.[colB ?? 1];
        if (from === undefined || to === undefined || from === 0) return { ok: false, error: "percentageChange needs two valid, non-zero-base cells via args=[rowA,colA,rowB,colB]." };
        const change = ((to - from) / from) * 100;
        return { ok: true, value: change, trace: `((${to} - ${from}) / ${from}) * 100` };
      }
      default:
        return { ok: false, error: `Unknown data-interpretation operation "${di.operation}".` };
    }
  }
}
