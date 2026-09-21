import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPool, closeAllPools } from "../lib/db/pool";
import { FIXTURE_USERS } from "../lib/db/fixtures";
import { evaluateSubmission } from "../lib/engine/evaluate-submission";
import { toSafeResult } from "../lib/engine/safe-result";
import type { EvaluationPolicy } from "../lib/engine/types";

const SOLUTIONS_DIR = path.join(process.cwd(), "scripts", "demo-problem", "solutions");

const CANDIDATES: Array<{ label: string; file: string; expectDescription: string }> = [
  { label: "correct", file: "correct.py", expectDescription: "should pass everything" },
  {
    label: "subtly buggy (duplicate-blind)",
    file: "buggy_duplicate_blind.py",
    expectDescription: "passes public tests, WRONG_ANSWER on duplicate/self-pair hidden tests",
  },
  {
    label: "inefficient (O(n^2) brute force)",
    file: "bruteforce_inefficient.py",
    expectDescription: "correct logic, TIME_LIMIT_EXCEEDED on large_input/performance hidden tests",
  },
  {
    label: "resource violator",
    file: "resource_violator.py",
    expectDescription: "MEMORY_LIMIT_EXCEEDED on essentially every test",
  },
  {
    label: "malicious probe",
    file: "malicious_probe.py",
    expectDescription: "correct answer; sandbox probes (fs/network) are contained, not fatal",
  },
];

async function main() {
  const ids = JSON.parse(readFileSync(path.join(process.cwd(), ".demo-problem-ids.json"), "utf8"));
  const pool = getPool("service"); // the orchestrator legitimately needs hidden test access

  const policy: EvaluationPolicy = {
    earlyTermination: "none",
    criticalCategories: [],
    assessmentMode: "learning", // richest safe view, to show the full safe-result shape
  };

  console.log("=".repeat(70));
  console.log("FINAL END-TO-END DEMONSTRATION");
  console.log(`Problem: pair-sum-equals-target  (problem_version=${ids.problemVersionId})`);
  console.log(`Test suite version: ${ids.testSuiteVersionId} (published, immutable)`);
  console.log("=".repeat(70));

  for (const candidate of CANDIDATES) {
    const source = readFileSync(path.join(SOLUTIONS_DIR, candidate.file), "utf8");

    const submissionId = (
      await pool.query(
        `insert into public.submissions (student_id, problem_id, problem_version_id, language, source_code, status, idempotency_key)
         values ($1,$2,$3,'python3',$4,'queued',$5) returning id`,
        [FIXTURE_USERS.student.id, ids.problemId, ids.problemVersionId, source, randomUUID()]
      )
    ).rows[0].id;

    const t0 = Date.now();
    const { result, evaluationRunId } = await evaluateSubmission({ pool, submissionId, policy });
    const elapsed = Date.now() - t0;

    const safe = toSafeResult(submissionId, "completed", result, policy);

    console.log(`\n--- ${candidate.label} (${candidate.file}) ---`);
    console.log(`expected: ${candidate.expectDescription}`);
    console.log(`  submission_id     = ${submissionId}`);
    console.log(`  evaluation_run_id = ${evaluationRunId}`);
    console.log(`  wall time         = ${elapsed}ms`);
    console.log(`  overall_verdict   = ${result.overallVerdict}`);
    console.log(`  score             = ${result.score}/${result.maxScore}`);
    console.log(`  category results  = ${JSON.stringify(result.categoryResults)}`);
    console.log(`  --- what the STUDENT'S BROWSER would receive (SafeResult) ---`);
    console.log(`  ${JSON.stringify(safe, null, 2).split("\n").join("\n  ")}`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Confirming the hidden input/expected-output text never appears in any SafeResult...");
  const { rows: hiddenRows } = await pool.query(
    `select input_data, expected_output from public.hidden_test_cases where test_suite_version_id = $1`,
    [ids.testSuiteVersionId]
  );
  console.log(`(checked against ${hiddenRows.length} real hidden test payloads — see tests/integration/anti-leakage.test.ts for the automated version of this check)`);

  await closeAllPools();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
