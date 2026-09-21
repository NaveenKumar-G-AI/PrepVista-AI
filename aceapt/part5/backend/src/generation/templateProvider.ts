import { randomUUID } from "node:crypto";
import { Difficulty, QuestionHealth, QuestionSource } from "../domain/enums";
import { Question } from "../domain/types";
import { GenerationResult, QuestionProvider, QuestionSpecification } from "./types";
import { templatesForSkill } from "./templateRegistry";

function closestSupportedDifficulty(supported: Difficulty[], target: Difficulty): Difficulty {
  return supported.reduce((best, d) => (Math.abs(d - target) < Math.abs(best - target) ? d : best), supported[0]);
}

export const TemplateProvider: QuestionProvider = {
  name: "template",
  isAvailable: () => true,

  async generate(spec: QuestionSpecification): Promise<GenerationResult> {
    let candidates = templatesForSkill(spec.skill.id);
    if (spec.questionType) {
      const typed = candidates.filter((t) => t.questionType === spec.questionType);
      if (typed.length > 0) candidates = typed;
    }
    candidates = candidates.filter((t) => !spec.avoidTemplateIds.includes(t.id));
    if (candidates.length === 0) candidates = templatesForSkill(spec.skill.id); // relax the avoid-list rather than fail outright

    if (candidates.length === 0) {
      return { question: null, providerUsed: "template", error: `No templates registered for skill ${spec.skill.id}` };
    }

    const template = candidates[Math.floor(Math.random() * candidates.length)];
    const renderDifficulty = closestSupportedDifficulty(template.supportedDifficulties, spec.targetDifficulty);
    const rendered = template.render(renderDifficulty);

    const question: Question = {
      id: randomUUID(),
      domain: "Quantitative Aptitude",
      topic: "Percentages",
      subtopic: spec.skill.subtopic,
      skillId: spec.skill.id,
      prerequisites: spec.skill.prerequisites,
      difficulty: template.difficultyProfile(renderDifficulty),
      questionType: template.questionType,
      cognitiveDemand: template.cognitiveDemand,
      expectedTimeSeconds: template.expectedTimeSeconds(renderDifficulty),
      prompt: rendered.prompt,
      options: rendered.options,
      explanation: rendered.explanation,
      hints: rendered.hints,
      commonMisconceptions: rendered.commonMisconceptions,
      errorCategoriesCovered: Array.from(new Set(rendered.options.map((o) => o.misconception).filter(Boolean))) as Question["errorCategoriesCovered"],
      tags: template.tags,
      version: 1,
      qualityStatus: QuestionHealth.REVIEW_REQUIRED, // the quality gate promotes this, never the provider itself
      source: QuestionSource.TEMPLATE_GENERATED,
      templateId: template.id,
      examRelevance: 0.7,
      createdAt: new Date().toISOString(),
    };

    return { question, providerUsed: "template" };
  },
};
