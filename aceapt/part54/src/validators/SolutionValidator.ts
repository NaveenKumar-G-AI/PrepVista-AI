import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";
import { safeEvaluate, numbersWithinTolerance, DEFAULT_TOLERANCE } from "./support/safeMath.js";
import { extractNumericValue } from "./support/numericAnswer.js";

export class SolutionValidator implements Validator {
  readonly name = "SOLUTION_VALIDATOR";
  readonly category = "SOLUTION" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["ANSWER_VALIDATOR"];

  isApplicable(input: ValidatorInput): boolean {
    // Whether a solution is REQUIRED at all is a profile/product policy decision
    // (enforced upstream via required-field policy, not here) — this validator's
    // job is narrower: IF a solution exists, is it internally consistent.
    return input.questionVersion.solution !== undefined;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const solution = q.solution!;
    const tolerance = q.derivation?.tolerance ?? DEFAULT_TOLERANCE;

    // Step ordering + step-level arithmetic (spec §38)
    const stepIssues: { stepId: string; issue: string }[] = [];
    const sortedOrders = [...solution.steps].map((s) => s.order).sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i + 1) {
        stepIssues.push({ stepId: "n/a", issue: `Step ordering is not a contiguous 1..N sequence (got: ${sortedOrders.join(",")}).` });
        break;
      }
    }
    for (const step of solution.steps) {
      if (step.expression && step.expectedValue !== undefined) {
        const evaluated = safeEvaluate(step.expression);
        if (!evaluated.ok) {
          stepIssues.push({ stepId: step.id, issue: `Step expression "${step.expression}" could not be evaluated: ${evaluated.error}` });
        } else if (!numbersWithinTolerance(evaluated.value, step.expectedValue, tolerance)) {
          stepIssues.push({
            stepId: step.id,
            issue: `Step "${step.expression}" evaluates to ${evaluated.value}, but the step declares expectedValue ${step.expectedValue}.`
          });
        }
      }
    }

    if (stepIssues.length > 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "HIGH",
        code: "SOLUTION_STEP_INVALID",
        message: `${stepIssues.length} solution step(s) failed internal consistency checks.`,
        evidence: { stepIssues },
        validatorVersion: this.version,
        startedAt
      });
    }

    // finalExpression, if present, must itself evaluate to finalAnswer.
    let finalExpressionValue: number | undefined;
    if (solution.finalExpression) {
      const evaluated = safeEvaluate(solution.finalExpression);
      if (!evaluated.ok) {
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "FAIL",
          severity: "HIGH",
          code: "SOLUTION_UNPARSEABLE",
          message: `Solution's final expression "${solution.finalExpression}" could not be evaluated: ${evaluated.error}`,
          validatorVersion: this.version,
          startedAt
        });
      }
      finalExpressionValue = evaluated.value;
      if (solution.finalAnswer !== undefined) {
        const declaredFinal = extractNumericValue(solution.finalAnswer);
        if (declaredFinal && !numbersWithinTolerance(evaluated.value, declaredFinal.value, tolerance)) {
          return buildResult({
            validator: this.name,
            category: this.category,
            status: "FAIL",
            severity: "CRITICAL",
            code: "SOLUTION_MISMATCH",
            message: `Solution's own final expression evaluates to ${evaluated.value}, which disagrees with its stated final answer ${solution.finalAnswer}.`,
            evidence: { finalExpression: solution.finalExpression, expressionValue: evaluated.value, statedFinalAnswer: solution.finalAnswer },
            validatorVersion: this.version,
            startedAt
          });
        }
      }
    }

    // Cross-check against the DECLARED answer (spec §37 — the flagship example:
    // declared 20%, solution computes 25%). Compare against the resolved VALUE
    // the declared answer represents, not the raw normalized form — for
    // SINGLE_SELECT that normalized form is an option id ("opt_b"), which is
    // exactly what grading needs but is meaningless to compare against a
    // solution's numeric conclusion (100). Real bug found via testing: an
    // earlier version compared against normalizedAnswer directly and flagged
    // every correct SINGLE_SELECT solution as a mismatch against its own id.
    const answerEvidence = input.context.upstreamResults.get("ANSWER_VALIDATOR")?.evidence;
    const declaredNumeric = answerEvidence?.numericValue as number | undefined;
    const declaredNormalized = answerEvidence?.normalizedAnswer;
    const declaredText =
      q.answerType === "SINGLE_SELECT" && q.options ? q.options.find((o) => o.id === declaredNormalized)?.text : typeof declaredNormalized === "string" ? declaredNormalized : undefined;

    const solutionFinal = solution.finalAnswer ?? finalExpressionValue;
    const solutionNumeric = extractNumericValue(solutionFinal)?.value ?? (typeof finalExpressionValue === "number" ? finalExpressionValue : undefined);
    let finalAnswerNumeric: number | undefined = solutionNumeric;

    if (solutionFinal !== undefined) {
      let mismatch = false;
      if (solutionNumeric !== undefined && declaredNumeric !== undefined) {
        mismatch = Math.abs(solutionNumeric - declaredNumeric) > tolerance;
      } else if (declaredText !== undefined) {
        mismatch = String(solutionFinal).trim().toLowerCase() !== declaredText.trim().toLowerCase();
      }
      // If neither a numeric nor a textual comparable representation exists on
      // both sides (e.g. MATCHING/ORDERING answers), there's nothing safe to
      // compare — silence here is deliberate, not a false PASS on a real check.

      if (mismatch) {
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "FAIL",
          severity: "CRITICAL",
          code: "SOLUTION_MISMATCH",
          message: `Solution concludes "${String(solutionFinal)}" but the declared answer is "${declaredNumeric ?? declaredText ?? String(declaredNormalized)}".`,
          evidence: { solutionFinalAnswer: solutionFinal, declaredAnswer: declaredNumeric ?? declaredText ?? declaredNormalized },
          validatorVersion: this.version,
          startedAt
        });
      }
    }

    return buildResult({
      validator: this.name,
      category: this.category,
      status: "PASS",
      severity: "NONE",
      code: "VALID",
      message: "Solution is internally consistent and agrees with the declared answer.",
      evidence: { finalAnswerNumeric, unitOfFinalAnswer: solution.unitOfFinalAnswer, stepCount: solution.steps.length },
      validatorVersion: this.version,
      startedAt
    });
  }
}
