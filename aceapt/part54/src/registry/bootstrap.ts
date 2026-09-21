import { ValidatorRegistry } from "./ValidatorRegistry.js";
import { SchemaValidator } from "../validators/SchemaValidator.js";
import { AnswerValidator } from "../validators/AnswerValidator.js";
import { OptionsValidator } from "../validators/OptionsValidator.js";
import { SolutionValidator } from "../validators/SolutionValidator.js";
import { MathValidator } from "../validators/MathValidator.js";
import { UnitsValidator } from "../validators/UnitsValidator.js";
import { LogicValidator } from "../validators/LogicValidator.js";
import { SkillValidator } from "../validators/SkillValidator.js";
import { DifficultyValidator } from "../validators/DifficultyValidator.js";
import { RuntimeValidator } from "../validators/RuntimeValidator.js";
import { AssetValidator, ScoringCompatibilityValidator, AssessmentCompatibilityValidator } from "../validators/AssetScoringAssessmentValidators.js";
import { AISemanticValidator } from "../validators/AISemanticValidator.js";
import type { AIValidatorClient } from "../ai/AIValidatorClient.js";

export function createRegistry(aiClient?: AIValidatorClient): ValidatorRegistry {
  const registry = new ValidatorRegistry();

  registry.register(new SchemaValidator());
  registry.register(new AnswerValidator());
  registry.register(new OptionsValidator());
  registry.register(new SolutionValidator());
  registry.register(new MathValidator());
  registry.register(new UnitsValidator());
  registry.register(new LogicValidator());
  registry.register(new SkillValidator());
  registry.register(new DifficultyValidator());
  registry.register(new RuntimeValidator());
  registry.register(new AssetValidator());
  registry.register(new ScoringCompatibilityValidator());
  registry.register(new AssessmentCompatibilityValidator());
  registry.register(aiClient ? new AISemanticValidator(aiClient) : new AISemanticValidator());

  registry.assertDependenciesResolvable();
  return registry;
}
