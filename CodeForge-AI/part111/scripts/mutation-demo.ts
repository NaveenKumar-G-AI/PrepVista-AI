import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool, closeAllPools } from "../lib/db/pool";
import { FIXTURE_USERS } from "../lib/db/fixtures";
import { runMutationTesting } from "../lib/mutation/harness";

async function main() {
  const ids = JSON.parse(readFileSync(path.join(process.cwd(), ".demo-problem-ids.json"), "utf8"));
  const pool = getPool("service");

  const referenceSource = readFileSync(
    path.join(process.cwd(), "scripts", "demo-problem", "reference_solution.py"),
    "utf8"
  );

  console.log("=".repeat(70));
  console.log("MUTATION TESTING — validating the hidden suite's own strength");
  console.log("=".repeat(70));

  const report = await runMutationTesting(pool, ids.testSuiteVersionId, referenceSource, "python3", {
    timeMs: 2000,
    memoryMb: 256,
    outputKb: 1024,
  });

  for (const d of report.details) {
    console.log(`  [${d.killed ? "KILLED " : "SURVIVED"}] ${d.mutantId}`);
    console.log(`            ${d.description}`);
    if (d.killed) console.log(`            caught by a hidden test in category: ${d.killedByTestCategory}`);
    else console.log(`            *** the hidden suite did NOT detect this mutant ***`);
  }

  console.log(`\nDetection rate: ${report.mutantsKilled}/${report.mutantsTotal} = ${report.detectionRate}%`);
  console.log("(this number is computed from the run above, not asserted — see lib/mutation/harness.ts)");

  await pool.query(
    `insert into public.test_quality_reports
       (test_suite_version_id, mutation_detection_rate, mutants_total, mutants_killed, coverage_indicators, generated_by)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      ids.testSuiteVersionId,
      report.detectionRate,
      report.mutantsTotal,
      report.mutantsKilled,
      JSON.stringify({ details: report.details }),
      FIXTURE_USERS.admin.id,
    ]
  );
  console.log("\nQuality report persisted to public.test_quality_reports.");

  if (report.mutantsKilled < report.mutantsTotal) {
    console.log(
      `\nNOTE: ${report.mutantsTotal - report.mutantsKilled} mutant(s) survived. Per the spec's own rule ` +
        `("if the suite fails to detect a meaningful mutation, mark the test suite as potentially weak"), ` +
        `that is what this run is reporting — not a bug being hidden.`
    );
  }

  await closeAllPools();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
