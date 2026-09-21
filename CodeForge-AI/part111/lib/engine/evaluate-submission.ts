import type { Pool } from "pg";
import { evaluateTestCase } from "./verdict";
import { aggregateResults, shouldStopEarly } from "./scoring";
import { recordAudit } from "../db/audit";
import type {
  AggregateResult,
  CheckerConfig,
  EvaluationPolicy,
  TestCaseSpec,
  TestOutcome,
} from "./types";

interface EvaluateSubmissionArgs {
  pool: Pool; // must be the service-role pool — this function needs hidden test access
  submissionId: string;
  policy: EvaluationPolicy;
}

interface EvaluateSubmissionOutcome {
  evaluationRunId: string;
  result: AggregateResult;
  /** true if this call reused a prior run instead of re-executing (idempotency) */
  reused: boolean;
}

const DEFAULT_LIMITS = { timeMs: 2000, memoryMb: 256, outputKb: 1024, pidsLimit: 32 };

export async function evaluateSubmission(
  args: EvaluateSubmissionArgs
): Promise<EvaluateSubmissionOutcome> {
  const { pool, submissionId, policy } = args;

  const { rows: subRows } = await pool.query(
    `select id, student_id, problem_id, problem_version_id, language, source_code, status
     from public.submissions where id = $1`,
    [submissionId]
  );
  const submission = subRows[0];
  if (!submission) throw new Error(`submission ${submissionId} not found`);

  // --- Idempotency: if this submission already has a completed run, don't
  // re-execute candidate code (see DUPLICATE SUBMISSION PROTECTION). A
  // double-click or client retry must not run hidden tests twice.
  const { rows: existingRuns } = await pool.query(
    `select id, overall_verdict, score, max_score from public.evaluation_runs
     where submission_id = $1 and completed_at is not null
     order by started_at desc limit 1`,
    [submissionId]
  );
  if (existingRuns[0]) {
    const run = existingRuns[0];
    const { rows: outcomeRows } = await pool.query(
      `select category, is_public, verdict, weight, exec_time_ms, output_size_bytes, exit_code
       from public.submission_test_runs where evaluation_run_id = $1`,
      [run.id]
    );
    const outcomes: TestOutcome[] = outcomeRows.map(rowToOutcome);
    return {
      evaluationRunId: run.id,
      reused: true,
      result: aggregateResults(outcomes, policy),
    };
  }

  // --- Resolve immutable problem + test-suite versions. This is the pin:
  // no matter what changes later, this evaluation is judged against
  // exactly these versions.
  const { rows: pvRows } = await pool.query(
    `select id, spec, constraints, time_limit_ms, memory_limit_mb, output_limit_kb
     from public.problem_versions where id = $1`,
    [submission.problem_version_id]
  );
  const problemVersion = pvRows[0];
  if (!problemVersion) throw new Error(`problem_version ${submission.problem_version_id} not found`);

  const { rows: tsvRows } = await pool.query(
    `select tsv.id from public.test_suite_versions tsv
     where tsv.problem_version_id = $1 and tsv.status in ('published','validated')
     order by tsv.version_number desc limit 1`,
    [submission.problem_version_id]
  );
  const testSuiteVersion = tsvRows[0];
  if (!testSuiteVersion) {
    throw new Error(`no active test_suite_version for problem_version ${submission.problem_version_id}`);
  }

  const evalRunInsert = await pool.query(
    `insert into public.evaluation_runs (submission_id, test_suite_version_id, assessment_mode, policy)
     values ($1, $2, $3, $4) returning id, started_at`,
    [submissionId, testSuiteVersion.id, policy.assessmentMode, JSON.stringify(policy)]
  );
  const evaluationRunId = evalRunInsert.rows[0].id;

  await pool.query(`update public.submissions set status = 'running', updated_at = now() where id = $1`, [
    submissionId,
  ]);

  try {
    const defaultLimits = {
      timeMs: problemVersion.time_limit_ms,
      memoryMb: problemVersion.memory_limit_mb,
      outputKb: problemVersion.output_limit_kb,
    };

    // Public tests, from the public-safe spec (never from hidden_test_cases).
    const publicTests: TestCaseSpec[] = (problemVersion.spec?.publicTests ?? []).map(
      (t: { input: string; output: string }, i: number): TestCaseSpec => ({
        id: `public-${i}`,
        category: "basic",
        weight: 0,
        inputData: t.input,
        expectedOutput: t.output,
        checker: { kind: "whitespace_normalized" },
        isPublic: true,
        limits: defaultLimits,
      })
    );

    // Hidden tests — loaded ONLY here, server-side, via the service pool.
    const { rows: hiddenRows } = await pool.query(
      `select htc.id, htc.category, htc.difficulty, htc.weight, htc.input_data, htc.expected_output,
              htc.execution_limits, htc.checker_id,
              c.kind as checker_kind, c.config as checker_config,
              c.custom_source, c.custom_language
       from public.hidden_test_cases htc
       left join public.checkers c on c.id = htc.checker_id
       where htc.test_suite_version_id = $1 and htc.enabled = true and htc.status = 'active'
       order by htc.category, htc.created_at`,
      [testSuiteVersion.id]
    );

    const hiddenTests: Array<TestCaseSpec & { customCheckerSource?: string; customCheckerLanguage?: string }> =
      hiddenRows.map((row) => {
        const limits = { ...defaultLimits, ...(row.execution_limits ?? {}) };
        const checker: CheckerConfig = row.checker_kind
          ? { kind: row.checker_kind, ...(row.checker_config ?? {}) }
          : { kind: "whitespace_normalized" };
        return {
          id: row.id,
          category: row.category,
          weight: Number(row.weight),
          inputData: row.input_data,
          expectedOutput: row.expected_output ?? "",
          checker,
          isPublic: false,
          limits,
          customCheckerSource: row.custom_source ?? undefined,
          customCheckerLanguage: row.custom_language ?? undefined,
        };
      });

    const outcomes: TestOutcome[] = [];

    for (const test of [...publicTests, ...hiddenTests]) {
      const outcome = await evaluateTestCase(
        submission.language,
        submission.source_code,
        test,
        test.checker.kind === "custom" && "customCheckerSource" in test
          ? {
              source: (test as any).customCheckerSource,
              language: (test as any).customCheckerLanguage ?? submission.language,
            }
          : undefined
      );
      outcomes.push(outcome);

      await pool.query(
        `insert into public.submission_test_runs
           (evaluation_run_id, hidden_test_case_id, is_public, category, weight, verdict,
            exec_time_ms, memory_kb, output_size_bytes, exit_code, internal_note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          evaluationRunId,
          test.isPublic ? null : test.id,
          test.isPublic,
          outcome.category,
          outcome.weight,
          outcome.verdict,
          outcome.execTimeMs,
          outcome.memoryKb,
          outcome.outputSizeBytes,
          outcome.exitCode,
          outcome.internalNote.slice(0, 2000),
        ]
      );

      if (shouldStopEarly(outcomes, policy)) break;
    }

    const result = aggregateResults(outcomes, policy);

    await pool.query(
      `update public.evaluation_runs
       set completed_at = now(), overall_verdict = $2, score = $3, max_score = $4, resource_summary = $5
       where id = $1`,
      [
        evaluationRunId,
        result.overallVerdict,
        result.score,
        result.maxScore,
        JSON.stringify({
          testsRun: outcomes.length,
          totalHidden: hiddenTests.length,
          maxExecTimeMs: Math.max(0, ...outcomes.map((o) => o.execTimeMs)),
        }),
      ]
    );

    await pool.query(`update public.submissions set status = 'completed', updated_at = now() where id = $1`, [
      submissionId,
    ]);

    // Structured, traceable evidence — for a future skill engine, not built here.
    for (const [category, { passed, total }] of Object.entries(result.categoryResults)) {
      await pool.query(
        `insert into public.evidence_records (submission_id, student_id, problem_id, category, outcome, metric)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          submissionId,
          submission.student_id,
          submission.problem_id,
          category,
          passed === total ? "passed" : "failed",
          JSON.stringify({ passed, total }),
        ]
      );
    }

    await recordAudit(pool, submission.student_id, "student", "hidden_evaluation_executed", "evaluation_run", evaluationRunId, {
      submissionId,
      testSuiteVersionId: testSuiteVersion.id,
    });

    return { evaluationRunId, result, reused: false };
  } catch (err) {
    // Infrastructure failure during orchestration — never let this surface
    // as a student-fault verdict. Best-effort mark the run as JUDGE_ERROR;
    // if even that write fails, the submission simply stays 'running' and
    // is safe to retry (evaluateSubmission is idempotent on re-invocation
    // because of the "existingRuns" check above, keyed on a COMPLETED run —
    // a stuck 'running' row without a completed evaluation_run will just
    // re-execute cleanly).
    await pool
      .query(
        `update public.evaluation_runs set completed_at = now(), overall_verdict = 'JUDGE_ERROR', score = 0, max_score = 100 where id = $1`,
        [evaluationRunId]
      )
      .catch(() => {});
    await pool
      .query(`update public.submissions set status = 'error', updated_at = now() where id = $1`, [submissionId])
      .catch(() => {});
    throw err;
  }
}

function rowToOutcome(row: any): TestOutcome {
  return {
    testCaseId: "",
    category: row.category,
    weight: Number(row.weight ?? 0),
    isPublic: row.is_public,
    verdict: row.verdict,
    execTimeMs: row.exec_time_ms ?? 0,
    memoryKb: row.memory_kb,
    outputSizeBytes: row.output_size_bytes ?? 0,
    exitCode: row.exit_code,
    internalNote: "",
  };
}
