import { z } from "zod";
import type { Validator } from "../contracts/validator.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidatorInput, ValidationResult } from "../contracts/types.js";
import { ANSWER_TYPES } from "../contracts/types.js";

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  numericValue: z.number().optional()
});

const solutionStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
  text: z.string().min(1),
  expression: z.string().optional(),
  expectedValue: z.number().optional()
});

const solutionSchema = z.object({
  finalAnswer: z.union([z.string(), z.number()]).optional(),
  finalExpression: z.string().optional(),
  unitOfFinalAnswer: z.string().optional(),
  steps: z.array(solutionStepSchema)
});

/** Mirrors QuestionVersionSnapshot (contracts/types.ts) minus fields the pipeline
 *  itself computes (contentHash, updatedAt) — those are never "authored," so a
 *  missing contentHash is a caller bug, not a content defect, and doesn't belong
 *  in SchemaValidator's domain. */
const questionVersionSchema = z.object({
  questionId: z.string().min(1),
  versionId: z.string().min(1),
  versionNumber: z.number().int().nonnegative(),
  tenantId: z.string().nullable(),
  isGlobal: z.boolean(),
  status: z.enum(["DRAFT", "PUBLISHED", "SUSPENDED", "RETIRED"]),
  purpose: z.string().min(1),
  questionText: z.string().min(1),
  answerType: z.enum(ANSWER_TYPES),
  answer: z.unknown(),
  options: z.array(optionSchema).optional(),
  solution: solutionSchema.optional(),
  derivation: z.unknown().optional(),
  units: z.object({ expected: z.string(), allowEquivalentForms: z.boolean() }).optional(),
  skill: z.object({ primarySkillId: z.string().min(1), secondarySkillIds: z.array(z.string()) }),
  difficulty: z.object({ band: z.enum(["EASY", "MEDIUM", "HARD"]), numericValue: z.number().min(0).max(1).optional() }),
  assets: z.array(z.object({ ref: z.string(), version: z.string(), kind: z.enum(["IMAGE", "TABLE", "CHART"]) })),
  passage: z.object({ text: z.string(), evidenceSpan: z.string().optional() }).optional(),
  renderBlocks: z.array(z.object({ kind: z.enum(["MARKDOWN", "LATEX", "HTML"]), content: z.string() })),
  origin: z.enum(["HUMAN_AUTHORED", "AI_GENERATED", "IMPORTED", "ADAPTED"]),
  immutableSinceAssessmentUse: z.boolean(),
  contentHash: z.string().min(1),
  updatedAt: z.string().min(1)
});

export class SchemaValidator implements Validator {
  readonly name = "SCHEMA_VALIDATOR";
  readonly category = "SCHEMA" as const;
  readonly version = "1.0.0";
  readonly dependsOn: readonly string[] = [];

  isApplicable(): boolean {
    return true; // every question version passes through schema validation
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const startedAt = Date.now();
    const parsed = questionVersionSchema.safeParse(input.questionVersion);

    if (parsed.success) {
      return buildResult({
        validator: this.name,
        category: this.category,
        status: "PASS",
        severity: "NONE",
        code: "VALID",
        message: "Question version conforms to the required schema.",
        validatorVersion: this.version,
        startedAt
      });
    }

    const firstIssue = parsed.error.issues[0]!;
    const code = firstIssue.code === "invalid_enum_value" || firstIssue.code === "invalid_literal" ? "SCHEMA_INVALID_ENUM" : firstIssue.code === "invalid_type" && firstIssue.received === "undefined" ? "SCHEMA_MISSING_FIELD" : "SCHEMA_INVALID_TYPE";

    return buildResult({
      validator: this.name,
      category: this.category,
      status: "FAIL",
      severity: "CRITICAL",
      code,
      message: `Schema validation failed: ${firstIssue.path.join(".")} — ${firstIssue.message}`,
      evidence: {
        issueCount: parsed.error.issues.length,
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message }))
      },
      validatorVersion: this.version,
      startedAt
    });
  }
}
