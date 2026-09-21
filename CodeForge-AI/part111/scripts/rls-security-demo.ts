import { readFileSync } from "node:fs";
import path from "node:path";
import { withUser, getPool, closeAllPools } from "../lib/db/pool";
import { FIXTURE_USERS } from "../lib/db/fixtures";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail: string) {
  const status = condition ? "PASS" : "FAIL";
  if (condition) passed++;
  else failed++;
  console.log(`[${status}] ${label}\n       ${detail}`);
}

/**
 * A table can block a student two ways in this schema: no GRANT at all
 * (throws "permission denied" before RLS is even consulted), or a GRANT
 * exists but RLS filters every row to zero. Both are a legitimate "no
 * access" outcome — the first is actually the stronger guarantee.
 */
async function expectNoAccess(label: string, fn: () => Promise<{ rows: any[] }>) {
  try {
    const { rows } = await fn();
    check(label, rows.length === 0, `rows returned: ${rows.length} (expected 0 — RLS filtered every row)`);
  } catch (err) {
    const msg = (err as Error).message;
    check(
      label,
      /permission denied/i.test(msg),
      `blocked at the GRANT level (no access to the table at all): ${msg.split("\n")[0]}`
    );
  }
}

async function main() {
  const ids = JSON.parse(readFileSync(path.join(process.cwd(), ".demo-problem-ids.json"), "utf8"));
  const servicePool = getPool("service");

  console.log("=".repeat(70));
  console.log("RLS / AUTHORIZATION SECURITY DEMONSTRATION");
  console.log("Every query below uses role app_authenticated (RLS enforced),");
  console.log("connecting as a real student account — not the service role.");
  console.log("=".repeat(70));

  await expectNoAccess("Student cannot SELECT hidden_test_cases directly", () =>
    withUser(FIXTURE_USERS.student.id, (c) =>
      c.query(`select * from public.hidden_test_cases where test_suite_version_id = $1`, [ids.testSuiteVersionId])
    )
  );

  await expectNoAccess("Student cannot SELECT reference_solutions", () =>
    withUser(FIXTURE_USERS.student.id, (c) =>
      c.query(`select * from public.reference_solutions where problem_version_id = $1`, [ids.problemVersionId])
    )
  );

  await expectNoAccess("Student cannot SELECT checkers", () =>
    withUser(FIXTURE_USERS.student.id, (c) => c.query(`select * from public.checkers`))
  );

  await expectNoAccess("Student cannot SELECT evaluation_runs directly (must use the safe RPC)", () =>
    withUser(FIXTURE_USERS.student.id, (c) => c.query(`select * from public.evaluation_runs`))
  );

  await expectNoAccess("Student cannot SELECT submission_test_runs directly", () =>
    withUser(FIXTURE_USERS.student.id, (c) => c.query(`select * from public.submission_test_runs`))
  );

  await expectNoAccess("Student cannot SELECT audit_log", () =>
    withUser(FIXTURE_USERS.student.id, (c) => c.query(`select * from public.audit_log`))
  );

  await expectNoAccess("Student cannot SELECT test_suite_versions directly", () =>
    withUser(FIXTURE_USERS.student.id, (c) => c.query(`select * from public.test_suite_versions`))
  );

  // --- IDOR: student tries to read/act on ANOTHER student's submission ---
  const otherSubmission = await servicePool.query(
    `insert into public.submissions (student_id, problem_id, problem_version_id, language, source_code, status, idempotency_key)
     values ($1,$2,$3,'python3','print(1)','completed',$4) returning id`,
    [FIXTURE_USERS.student2.id, ids.problemId, ids.problemVersionId, "idor-test-" + Date.now()]
  );
  const otherSubmissionId = otherSubmission.rows[0].id;

  await expectNoAccess("Student cannot SELECT another student's submission (IDOR)", () =>
    withUser(FIXTURE_USERS.student.id, (c) => c.query(`select * from public.submissions where id = $1`, [otherSubmissionId]))
  );

  await withUser(FIXTURE_USERS.student.id, async (client) => {
    const { rows } = await client.query(`select public.get_safe_evaluation_result($1) as result`, [otherSubmissionId]);
    check(
      "Safe-result RPC returns null for another student's submission (IDOR via RPC)",
      rows[0].result === null,
      `RPC result: ${JSON.stringify(rows[0].result)}`
    );
  });

  // --- Mass assignment / impersonation: insert a submission as someone else ---
  await withUser(FIXTURE_USERS.student.id, async (client) => {
    let insertSucceeded = true;
    let errorMsg = "";
    try {
      await client.query(
        `insert into public.submissions (student_id, problem_id, problem_version_id, language, source_code, status, idempotency_key)
         values ($1,$2,$3,'python3','print(1)','queued',$4)`,
        [FIXTURE_USERS.student2.id, ids.problemId, ids.problemVersionId, "impersonation-" + Date.now()]
      );
    } catch (err) {
      insertSucceeded = false;
      errorMsg = (err as Error).message;
    }
    check(
      "Student cannot INSERT a submission with another student's student_id",
      !insertSucceeded,
      insertSucceeded ? "INSERT succeeded (SECURITY BUG)" : `blocked: ${errorMsg.split("\n")[0]}`
    );
  });

  // --- Parameter tampering: student tries to modify a hidden test case's weight ---
  const oneHiddenTest = await servicePool.query(
    `select id from public.hidden_test_cases where test_suite_version_id = $1 limit 1`,
    [ids.testSuiteVersionId]
  );
  await withUser(FIXTURE_USERS.student.id, async (client) => {
    try {
      const result = await client.query(`update public.hidden_test_cases set weight = 999 where id = $1`, [
        oneHiddenTest.rows[0].id,
      ]);
      check("Student cannot UPDATE a hidden test case's weight", result.rowCount === 0, `rows affected: ${result.rowCount}`);
    } catch (err) {
      check(
        "Student cannot UPDATE a hidden test case's weight",
        true,
        `blocked at the GRANT level: ${(err as Error).message.split("\n")[0]}`
      );
    }
  });

  // --- Legitimate access still works ---
  await withUser(FIXTURE_USERS.admin.id, async (client) => {
    const { rows } = await client.query(`select * from public.hidden_test_cases where test_suite_version_id = $1`, [
      ids.testSuiteVersionId,
    ]);
    check("Admin CAN SELECT hidden_test_cases (legitimate access still works)", rows.length > 0, `rows returned: ${rows.length}`);
  });

  const ownSubmission = await servicePool.query(
    `select id from public.submissions where student_id = $1 order by created_at desc limit 1`,
    [FIXTURE_USERS.student.id]
  );
  if (ownSubmission.rows[0]) {
    await withUser(FIXTURE_USERS.student.id, async (client) => {
      const { rows } = await client.query(`select public.get_safe_evaluation_result($1) as result`, [ownSubmission.rows[0].id]);
      check("Student CAN read their own safe evaluation result via the RPC", rows[0].result !== null, `RPC result present: ${rows[0].result !== null}`);
    });
  } else {
    console.log("(skipped 'student can read own result' — run scripts/e2e-demo.ts first to create a submission)");
  }

  // --- Immutability: try to mutate a published test suite version, even as service role ---
  await servicePool
    .query(`update public.test_suite_versions set status = 'draft' where id = $1`, [ids.testSuiteVersionId])
    .then(() => check("Published test_suite_version rejects UPDATE back to draft", false, "UPDATE succeeded — INTEGRITY BUG"))
    .catch((err) =>
      check("Published test_suite_version rejects UPDATE back to draft", true, `blocked by trigger: ${(err as Error).message.split("\n")[0]}`)
    );

  await servicePool
    .query(`update public.hidden_test_cases set weight = 42 where id = $1`, [oneHiddenTest.rows[0].id])
    .then(() => check("Hidden test under a published suite rejects UPDATE (even via service role)", false, "UPDATE succeeded — INTEGRITY BUG"))
    .catch((err) =>
      check(
        "Hidden test under a published suite rejects UPDATE (even via service role)",
        true,
        `blocked by trigger: ${(err as Error).message.split("\n")[0]}`
      )
    );

  console.log("\n" + "=".repeat(70));
  console.log(`RESULT: ${passed} passed, ${failed} failed (out of ${passed + failed} checks)`);
  console.log("=".repeat(70));

  await closeAllPools();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
