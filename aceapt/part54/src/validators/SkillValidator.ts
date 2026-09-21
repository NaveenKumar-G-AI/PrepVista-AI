import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";

/** Loose mapping from a math domain to the operation-signature keywords a
 *  correctly-tagged skill would carry. Deliberately a heuristic (spec §52:
 *  "Feature 45 remains canonical") — this can suggest a mismatch worth a
 *  human look; it cannot itself declare a skill mapping wrong. */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  PERMUTATION_COMBINATION: ["permutation", "combination", "counting"],
  PROBABILITY: ["probability", "chance", "odds"],
  PERCENTAGE: ["percentage", "percent"],
  RATIO: ["ratio", "proportion"],
  AVERAGE: ["average", "mean"],
  PROFIT_LOSS: ["profit", "loss", "cost", "price"],
  SIMPLE_INTEREST: ["interest", "simple-interest"],
  COMPOUND_INTEREST: ["interest", "compound-interest"],
  TIME_WORK: ["time-and-work", "work", "rate"],
  SPEED_DISTANCE: ["speed", "distance", "time"],
  GEOMETRY: ["geometry", "area", "perimeter", "volume", "angle"],
  ALGEBRA: ["algebra", "equation"],
  DATA_INTERPRETATION: ["data-interpretation", "chart", "table"],
  ARITHMETIC: ["arithmetic", "calculation"]
};

export class SkillValidator implements Validator {
  readonly name = "SKILL_VALIDATOR";
  readonly category = "SKILL" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = ["SCHEMA_VALIDATOR"];

  isApplicable(): boolean {
    return true;
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const q = input.questionVersion;
    const skillGraph = input.context.ports.skillGraph;

    const primary = await skillGraph.resolveSkill(q.skill.primarySkillId);
    if (!primary) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "CRITICAL",
        code: "SKILL_UNRESOLVABLE",
        message: `Primary skill id "${q.skill.primarySkillId}" does not resolve against the skill graph.`,
        validatorVersion: this.version,
        startedAt
      });
    }

    const unresolvedSecondary: string[] = [];
    for (const secondaryId of q.skill.secondarySkillIds) {
      const resolved = await skillGraph.resolveSkill(secondaryId);
      if (!resolved) unresolvedSecondary.push(secondaryId);
    }
    if (unresolvedSecondary.length > 0) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "FAIL",
        severity: "MEDIUM",
        code: "SKILL_UNRESOLVABLE",
        message: `Secondary skill id(s) do not resolve: ${unresolvedSecondary.join(", ")}.`,
        evidence: { unresolvedSecondary },
        validatorVersion: this.version,
        startedAt
      });
    }

    const domain = q.derivation?.domain;
    if (domain && DOMAIN_KEYWORDS[domain]) {
      const keywords = DOMAIN_KEYWORDS[domain]!;
      const signature = primary.operationSignature.map((s) => s.toLowerCase());
      const matches = keywords.some((k) => signature.some((s) => s.includes(k)));
      if (!matches) {
        return buildResult({
          validator: this.name,
          category: this.category,
          status: "PASS_WITH_WARNING",
          severity: "MEDIUM",
          code: "SKILL_MISMATCH",
          message: `Question is tagged as skill "${primary.name}", but its computation domain (${domain}) doesn't match that skill's operation signature — worth a content-team look (Feature 45 remains canonical on the actual mapping).`,
          evidence: { primarySkill: primary.name, operationSignature: primary.operationSignature, computedDomain: domain },
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
      message: "Skill metadata resolves and is consistent with the question's computed domain where checkable.",
      evidence: { primarySkill: primary.name, secondaryCount: q.skill.secondarySkillIds.length },
      validatorVersion: this.version,
      startedAt
    });
  }
}
