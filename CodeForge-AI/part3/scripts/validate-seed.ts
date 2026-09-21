import { SEED_CHALLENGES } from "../src/data/seedChallenges.js";
import { runTestCase } from "../src/execution/executor.js";
import { SupportedLanguage } from "../src/domain/types.js";

let allOk = true;

for (const ch of SEED_CHALLENGES) {
  const lang = SupportedLanguage.PYTHON;
  const solution = ch.solutionMetadata.referenceSolution[lang];
  if (!solution) {
    console.log(`SKIP ${ch.challengeId}: no python reference solution`);
    continue;
  }
  const allTests = [...ch.publicTests, ...ch.hiddenTests];
  const results = allTests.map((tc) =>
    runTestCase(lang, solution, ch.evaluationMetadata.entryFunction, ch.evaluationMetadata.comparisonMode, tc),
  );
  const failed = results.filter((r) => !r.result.passed);
  const status = failed.length === 0 ? "PASS" : "FAIL";
  if (failed.length !== 0) allOk = false;
  console.log(`[reference] ${ch.challengeId}: ${status} (${allTests.length - failed.length}/${allTests.length})`);
  for (const f of failed) {
    console.log(`   ✗ ${f.result.testId}: expected ${JSON.stringify(f.result.expectedOutput)}, got ${JSON.stringify(f.outcome.actualOutput)}, err=${f.result.errorMessage ?? "none"}`);
  }
}

console.log("\n--- checking challenge 1's buggy starter against design intent ---");
const ch1 = SEED_CHALLENGES[0]!;
const buggy = ch1.starterCode[SupportedLanguage.PYTHON]!;
const allTests1 = [...ch1.publicTests, ...ch1.hiddenTests];
const results1 = allTests1.map((tc) => ({
  tc,
  ...runTestCase(SupportedLanguage.PYTHON, buggy, ch1.evaluationMetadata.entryFunction, ch1.evaluationMetadata.comparisonMode, tc),
}));
const passed1 = results1.filter((r) => r.result.passed);
const failed1 = results1.filter((r) => !r.result.passed);
console.log(`buggy starter: ${passed1.length}/${allTests1.length} passed`);
console.log("failing tests:", failed1.map((r) => `${r.tc.id} (${r.tc.category})`).join(", "));
console.log("passing tests:", passed1.map((r) => r.tc.id).join(", "));

const expectedFailIds = ["p4", "h3"];
const actualFailIds = failed1.map((r) => r.tc.id).sort();
const matches = JSON.stringify(actualFailIds) === JSON.stringify([...expectedFailIds].sort());
console.log(matches ? "✓ matches design intent (exactly p4 + h3 fail, 8/10 pass)" : "✗ DOES NOT MATCH design intent — needs fixing");
if (!matches) allOk = false;

for (const r of failed1) {
  console.log(`   ${r.tc.id}: ${r.result.errorMessage}`);
}

console.log(allOk ? "\n=== ALL SEED DATA VALID ===" : "\n=== SEED DATA HAS PROBLEMS ===");
process.exit(allOk ? 0 : 1);
