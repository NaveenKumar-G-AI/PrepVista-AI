import { randomUUID } from "node:crypto";
import { QuestionHealth, QuestionSource } from "../domain/enums";
import { Question, Skill } from "../domain/types";
import { QuestionRepository } from "../repositories/questionRepository";
import { ALL_TEMPLATES } from "../generation/templateRegistry";
import { runQualityGate } from "../generation/qualityGate";
import { SKILLS } from "./skills.seed";

const knownSkills = new Map<string, Skill>(SKILLS.map((s) => [s.id, s]));

/**
 * Seeds an initial, always-available question pool by rendering every
 * registered template at every difficulty it supports (a few instances
 * each, so there's variety from the very first session). This deliberately
 * reuses TemplateProvider's rendering logic path (via the templates
 * directly) and the exact same QualityGate the live generation pipeline
 * uses — there is no separate "seed data is exempt from validation" path.
 */
export function seedQuestions(instancesPerDifficulty = 3) {
  let created = 0;
  let rejected = 0;

  for (const template of ALL_TEMPLATES) {
    const skill = knownSkills.get(template.skillId);
    if (!skill) continue;

    for (const difficulty of template.supportedDifficulties) {
      for (let i = 0; i < instancesPerDifficulty; i++) {
        const rendered = template.render(difficulty);
        const question: Question = {
          id: randomUUID(),
          domain: "Quantitative Aptitude",
          topic: "Percentages",
          subtopic: skill.subtopic,
          skillId: skill.id,
          prerequisites: skill.prerequisites,
          difficulty: template.difficultyProfile(difficulty),
          questionType: template.questionType,
          cognitiveDemand: template.cognitiveDemand,
          expectedTimeSeconds: template.expectedTimeSeconds(difficulty),
          prompt: rendered.prompt,
          options: rendered.options,
          explanation: rendered.explanation,
          hints: rendered.hints,
          commonMisconceptions: rendered.commonMisconceptions,
          errorCategoriesCovered: Array.from(new Set(rendered.options.map((o) => o.misconception).filter(Boolean))) as Question["errorCategoriesCovered"],
          tags: template.tags,
          version: 1,
          qualityStatus: QuestionHealth.REVIEW_REQUIRED,
          source: QuestionSource.SEED,
          templateId: template.id,
          examRelevance: 0.75,
          createdAt: new Date().toISOString(),
        };

        const gate = runQualityGate(question, knownSkills);
        const finalQuestion = { ...question, qualityStatus: gate.status };
        QuestionRepository.upsert(finalQuestion);

        if (gate.status === QuestionHealth.HEALTHY) created++;
        else {
          rejected++;
          // eslint-disable-next-line no-console
          console.warn(`[seed] rejected ${template.id} @ ${difficulty}:`, gate.issues);
        }
      }
    }
  }

  return { created, rejected };
}
