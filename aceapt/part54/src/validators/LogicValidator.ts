import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";
import { solveCsp } from "./support/cspSolver.js";

export class LogicValidator implements Validator {
  readonly name = "LOGIC_VALIDATOR";
  readonly category = "LOGIC" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["ANSWER_VALIDATOR"];

  isApplicable(input: ValidatorInput): boolean {
    return Boolean(input.questionVersion.derivation?.csp);
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const csp = input.questionVersion.derivation!.csp!;
    const outcome = solveCsp(csp, 2);

    if (outcome.directContradiction) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "CONSTRAINT_CONFLICT",
        message: "The puzzle contains directly contradictory constraints (an EQUALS and a NOT_EQUALS on the same entity/attribute/value).",
        validatorVersion: this.version,
        startedAt
      });
    }

    if (outcome.solutions.length === 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "LOGIC_NO_SOLUTION",
        message: "No assignment satisfies every stated constraint — the puzzle as written has zero valid solutions.",
        evidence: { entityCount: csp.entities.length, attributeCount: Object.keys(csp.attributes).length, constraintCount: csp.constraints.length },
        validatorVersion: this.version,
        startedAt
      });
    }

    if (outcome.solutions.length > 1) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "HIGH",
        code: "LOGIC_MULTIPLE_SOLUTIONS",
        message: "More than one assignment satisfies every stated constraint — the puzzle does not have a unique answer.",
        evidence: { foundAtLeast: outcome.solutions.length, sampleSolutions: outcome.solutions.slice(0, 2) },
        validatorVersion: this.version,
        startedAt
      });
    }

    const solution = outcome.solutions[0]!;
    const derivedAnswer = solution[csp.query.entity]?.[csp.query.attribute];
    const answerEvidence = input.context.upstreamResults.get("ANSWER_VALIDATOR")?.evidence;
    const declaredAnswer = String(answerEvidence?.normalizedAnswer ?? "");

    if (derivedAnswer === undefined) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "ERROR",
        severity: "MEDIUM",
        code: "VALIDATOR_INTERNAL_ERROR",
        message: `Query target entity/attribute (${csp.query.entity}.${csp.query.attribute}) is not part of the puzzle's own entities/attributes.`,
        validatorVersion: this.version,
        startedAt
      });
    }

    if (derivedAnswer.trim().toLowerCase() !== declaredAnswer.trim().toLowerCase()) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "LOGIC_INVALID",
        message: `The puzzle's unique solution gives ${csp.query.entity}.${csp.query.attribute} = "${derivedAnswer}", but the declared answer is "${declaredAnswer}".`,
        evidence: { derivedAnswer, declaredAnswer, fullSolution: solution },
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
      message: "The puzzle has exactly one valid solution, and it matches the declared answer.",
      evidence: { derivedAnswer, fullSolution: solution },
      validatorVersion: this.version,
      startedAt
    });
  }
}
