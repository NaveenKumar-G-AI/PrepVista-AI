import { SKILLS } from "./seedData.js";

/**
 * Derives a prompt -> correct-choice-id lookup from our OWN seed fixture
 * data, for the demo harness only (scripts/demoWalkthrough.ts). This is not
 * a backdoor into the running system - it's the same data seed.ts already
 * wrote to the database, just read from the TS source instead of over HTTP,
 * so the demo script can play the role of a real student who happens to
 * know the answers, without the API ever exposing a "give me the answer"
 * endpoint (spec section 51 forbids exactly that).
 */
export const SEED_ANSWER_KEY: Record<string, string> = {};
for (const skill of SKILLS) {
  for (const q of skill.questions) {
    const choiceId = String.fromCharCode(97 + q.correctIndex);
    SEED_ANSWER_KEY[q.prompt] = choiceId;
  }
}
