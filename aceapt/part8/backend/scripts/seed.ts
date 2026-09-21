import "dotenv/config";
import { withServiceScope, closePools } from "../src/lib/db.js";
import { upsertSkill } from "../src/repositories/skillRepository.js";
import { createQuestion, listApprovedPromptsForSkill } from "../src/repositories/questionRepository.js";
import { genId } from "../src/lib/ids.js";
import { SKILLS } from "./seedData.js";

async function main() {
  await withServiceScope(async (client) => {
    for (const skillDef of SKILLS) {
      const skill = await upsertSkill(client, { id: genId(), key: skillDef.key, name: skillDef.name, category: skillDef.category, importance: skillDef.importance });

      const existingPrompts = new Set((await listApprovedPromptsForSkill(client, skill.id)).map((p) => p.prompt));
      let created = 0;
      for (const sq of skillDef.questions) {
        if (existingPrompts.has(sq.prompt)) continue; // idempotent re-seed
        const choices = sq.choices.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
        await createQuestion(client, {
          id: genId(),
          skillId: skill.id,
          formGroupId: genId(),
          prompt: sq.prompt,
          choices,
          correctAnswer: choices[sq.correctIndex].id,
          explanation: sq.explanation,
          difficulty: sq.difficulty,
          noveltyLevel: sq.noveltyLevel,
          contextType: sq.contextType,
          expectedTimeSeconds: sq.expectedTimeSeconds,
          generatedBy: "SEED",
          qualityStatus: "APPROVED",
        });
        created++;
      }
      console.log(`[seed] ${skillDef.name}: ${created} new question(s) (${skillDef.questions.length} total defined).`);
    }
  });
  console.log("[seed] done.");
}

main()
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
