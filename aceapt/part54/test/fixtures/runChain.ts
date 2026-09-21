import type { Validator } from "../../src/contracts/validator.js";
import type { ValidationResult, QuestionVersionSnapshot, ValidationMode } from "../../src/contracts/types.js";
import { SchemaValidator } from "../../src/validators/SchemaValidator.js";
import { AnswerValidator } from "../../src/validators/AnswerValidator.js";
import { makeInput } from "./baseline.js";

/**
 * Runs SCHEMA_VALIDATOR then ANSWER_VALIDATOR for real and returns the
 * resulting upstream-results map, so every other validator's unit test
 * exercises genuine evidence shapes rather than hand-authored fakes that
 * could silently drift from what AnswerValidator actually produces.
 */
export async function upstreamThroughAnswer(snapshot: QuestionVersionSnapshot, mode: ValidationMode = "DEEP"): Promise<Map<string, ValidationResult>> {
  const map = new Map<string, ValidationResult>();
  const schema = new SchemaValidator();
  const schemaResult = await schema.validate(makeInput(snapshot, mode, map));
  map.set("SCHEMA_VALIDATOR", schemaResult);

  const answer = new AnswerValidator();
  const answerResult = await answer.validate(makeInput(snapshot, mode, map));
  map.set("ANSWER_VALIDATOR", answerResult);
  return map;
}

export async function withValidator(validator: Validator, snapshot: QuestionVersionSnapshot, upstream: Map<string, ValidationResult>, mode: ValidationMode = "DEEP"): Promise<ValidationResult> {
  return validator.validate(makeInput(snapshot, mode, upstream));
}
