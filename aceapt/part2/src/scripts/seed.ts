import { SKILLS, SKILL_MAP } from "../data/seed/skills";
import { QUESTIONS } from "../data/seed/questions";
import { validateQuestion } from "../lib/domain/validation/questionValidator";
import { upsertSkill, upsertQuestion } from "../lib/db/repo";

function main() {
  console.log(`Seeding ${SKILLS.length} skills...`);
  for (const skill of SKILLS) {
    upsertSkill(skill);
  }

  console.log(`Validating and seeding ${QUESTIONS.length} questions...`);
  let validated = 0;
  let rejected = 0;
  for (const q of QUESTIONS) {
    const result = validateQuestion(q, SKILL_MAP);
    upsertQuestion(q, result.status, result.notes);
    if (result.valid) {
      validated++;
    } else {
      rejected++;
      console.log(`  ✗ REJECTED ${q.id}: ${result.notes}`);
    }
  }

  console.log(`\n✔ Seed complete: ${validated} questions VALIDATED, ${rejected} REJECTED and excluded from the live bank.`);
  if (validated < 8) {
    console.warn("⚠ Fewer than 8 validated questions — the diagnostic will not have enough coverage to run meaningfully.");
  }
}

main();
