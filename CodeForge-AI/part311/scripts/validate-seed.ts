import { SEED_CHALLENGES } from "../src/data/seedChallenges.js";
import { runTestCase } from "../src/execution/executor.js";
import type { SupportedLanguage } from "../src/domain/types.js";

let allOk = true;

for (const ch of SEED_CHALLENGES) {
  for (const lang of ch.supportedLanguages) {
    const solution = ch.solutionMetadata.referenceSolution[lang];
    if (!solution) {
      console.log(`✗ ${ch.challengeId} [${lang}]: declared as supported but has NO reference solution`);
      allOk = false;
      continue;
    }
    const allTests = [...ch.publicTests, ...ch.hiddenTests];
    const results = allTests.map((tc) =>
      runTestCase(lang as SupportedLanguage, solution, ch.evaluationMetadata.entryFunction, ch.evaluationMetadata.comparisonMode, tc),
    );
    const failed = results.filter((r) => !r.result.passed);
    const status = failed.length === 0 ? "PASS" : "FAIL";
    if (failed.length !== 0) allOk = false;
    console.log(`[reference] ${ch.challengeId} [${lang}]: ${status} (${allTests.length - failed.length}/${allTests.length})`);
    for (const f of failed) {
      console.log(`   ✗ ${f.result.testId}: expected ${JSON.stringify(f.result.expectedOutput)}, got ${JSON.stringify(f.outcome.actualOutput)}, err=${f.result.errorMessage ?? "none"}`);
    }
  }
}

console.log("\n--- checking challenge 1's buggy starter against design intent (every declared language) ---");
const ch1 = SEED_CHALLENGES[0]!;
const allTests1 = [...ch1.publicTests, ...ch1.hiddenTests];
const expectedFailIds = ["p4", "h3"].sort();

for (const lang of ch1.supportedLanguages) {
  const buggy = ch1.starterCode[lang];
  if (!buggy) {
    console.log(`✗ ${lang}: no starter code`);
    allOk = false;
    continue;
  }
  const results1 = allTests1.map((tc) => ({
    tc,
    ...runTestCase(lang as SupportedLanguage, buggy, ch1.evaluationMetadata.entryFunction, ch1.evaluationMetadata.comparisonMode, tc),
  }));
  const passed1 = results1.filter((r) => r.result.passed);
  const failed1 = results1.filter((r) => !r.result.passed);
  const actualFailIds = failed1.map((r) => r.tc.id).sort();
  const matches = JSON.stringify(actualFailIds) === JSON.stringify(expectedFailIds);
  console.log(`[${lang}] buggy starter: ${passed1.length}/${allTests1.length} passed — failing: ${actualFailIds.join(", ")} — ${matches ? "✓ matches design intent" : "✗ DOES NOT MATCH design intent"}`);
  if (!matches) allOk = false;
}

console.log(allOk ? "\n=== ALL SEED DATA VALID ===" : "\n=== SEED DATA HAS PROBLEMS ===");
process.exit(allOk ? 0 : 1);
