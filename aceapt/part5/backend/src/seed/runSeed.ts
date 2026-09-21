import { resetDatabase } from "../db/client";
import { seedSkills } from "./skills.seed";
import { seedQuestions } from "./questions.seed";
import { seedDemoStudent } from "./demoState.seed";

function main() {
  console.log("Resetting database...");
  resetDatabase();

  console.log("Seeding skill catalog...");
  seedSkills();

  console.log("Seeding question pool from templates...");
  const { created, rejected } = seedQuestions();
  console.log(`  ${created} questions HEALTHY, ${rejected} rejected by the quality gate.`);

  console.log("Seeding demo student history (via the real engines)...");
  seedDemoStudent();

  console.log("Done. Dev-login as the demo student:");
  console.log(`  curl -X POST http://localhost:4000/api/auth/dev-login -H "Content-Type: application/json" -d '{"studentId":"demo-student"}'`);
}

main();
