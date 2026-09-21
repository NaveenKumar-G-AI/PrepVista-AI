import { describe, expect, it } from "vitest";
import { ALL_TEMPLATES } from "../src/generation/templateRegistry";
import { runQualityGate } from "../src/generation/qualityGate";
import { QuestionHealth, QuestionSource } from "../src/domain/enums";
import { Skill } from "../src/domain/types";

const RUNS_PER_DIFFICULTY = 25;

const dummySkills = new Map<string, Skill>(
  ALL_TEMPLATES.map((t) => [t.skillId, { id: t.skillId, domain: "d", topic: "t", subtopic: "st", name: t.skillId, prerequisites: [] }])
);

describe("question templates", () => {
  for (const template of ALL_TEMPLATES) {
    for (const difficulty of template.supportedDifficulties) {
      it(`${template.id} @ difficulty ${difficulty}: always produces exactly one correct, numerically-consistent option (n=${RUNS_PER_DIFFICULTY})`, () => {
        for (let i = 0; i < RUNS_PER_DIFFICULTY; i++) {
          const rendered = template.render(difficulty);

          const correctOptions = rendered.options.filter((o) => o.isCorrect);
          expect(correctOptions.length, `prompt: ${rendered.prompt}`).toBe(1);

          const texts = rendered.options.map((o) => o.text);
          expect(new Set(texts).size, `duplicate option text in: ${rendered.prompt} -> ${texts.join(", ")}`).toBe(texts.length);

          expect(rendered.options.length).toBe(4);

          // The option marked correct must match the template's own computed answer,
          // once formatting is stripped back to a number — this is what proves the
          // "correct" flag wasn't accidentally attached to a distractor. Compared by
          // magnitude because some templates (e.g. profit/loss) encode sign as a
          // word ("12% loss") rather than a minus sign in the option text.
          const numericText = correctOptions[0].text.replace(/[^0-9.-]/g, "");
          expect(Math.abs(Number(numericText))).toBeCloseTo(Math.abs(rendered.correctValue), 1);

          expect(rendered.hints.length).toBeGreaterThanOrEqual(4);
          expect(rendered.explanation.correctReasoning.length).toBeGreaterThan(10);
        }
      });

      it(`${template.id} @ difficulty ${difficulty}: passes the quality gate as a template-sourced question`, () => {
        const rendered = template.render(difficulty);
        const question = {
          id: "test-id",
          domain: "Quantitative Aptitude",
          topic: "Percentages",
          subtopic: "st",
          skillId: template.skillId,
          prerequisites: [],
          difficulty: template.difficultyProfile(difficulty),
          questionType: template.questionType,
          cognitiveDemand: template.cognitiveDemand,
          expectedTimeSeconds: template.expectedTimeSeconds(difficulty),
          prompt: rendered.prompt,
          options: rendered.options,
          explanation: rendered.explanation,
          hints: rendered.hints,
          commonMisconceptions: rendered.commonMisconceptions,
          errorCategoriesCovered: [],
          tags: template.tags,
          version: 1,
          qualityStatus: QuestionHealth.REVIEW_REQUIRED,
          source: QuestionSource.TEMPLATE_GENERATED,
          createdAt: new Date().toISOString(),
        };
        const gate = runQualityGate(question as any, dummySkills);
        expect(gate.status, JSON.stringify(gate.issues)).toBe(QuestionHealth.HEALTHY);
      });
    }
  }

  it("every wrong option across every template carries a misconception tag (no untagged distractors slip through)", () => {
    let untaggedCount = 0;
    let totalWrongOptions = 0;
    for (const template of ALL_TEMPLATES) {
      for (const difficulty of template.supportedDifficulties) {
        const rendered = template.render(difficulty);
        for (const opt of rendered.options.filter((o) => !o.isCorrect)) {
          totalWrongOptions++;
          if (!opt.misconception) untaggedCount++;
        }
      }
    }
    expect(totalWrongOptions).toBeGreaterThan(0);
    expect(untaggedCount).toBe(0);
  });
});
