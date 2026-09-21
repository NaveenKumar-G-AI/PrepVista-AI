import { SKILLS, SKILL_MAP } from "../data/seed/skills";
import { QUESTIONS } from "../data/seed/questions";
import { validateQuestion } from "../lib/domain/validation/questionValidator";

function main() {
  console.log(`Validating ${QUESTIONS.length} questions against ${SKILLS.length} skills...\n`);

  let validated = 0;
  let rejected = 0;
  const bySkill: Record<string, number> = {};

  for (const q of QUESTIONS) {
    const result = validateQuestion(q, SKILL_MAP);
    bySkill[q.skillNodeId] = (bySkill[q.skillNodeId] ?? 0) + (result.valid ? 1 : 0);
    if (result.valid) {
      validated++;
    } else {
      rejected++;
      console.log(`✗ REJECTED ${q.id}: ${result.notes}`);
    }
  }

  console.log(`\n${validated} validated, ${rejected} rejected.\n`);
  console.log("Questions per skill:");
  for (const skill of SKILLS) {
    const count = bySkill[skill.id] ?? 0;
    const flag = count === 0 ? "  ⚠ no validated questions" : "";
    console.log(`  ${skill.id.padEnd(10)} ${String(count).padStart(2)}  ${skill.displayName}${flag}`);
  }

  if (rejected > 0) {
    process.exitCode = 1;
  }
}

main();
