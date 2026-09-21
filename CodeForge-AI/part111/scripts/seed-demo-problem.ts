import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getPool, closeAllPools } from "../lib/db/pool";
import { FIXTURE_USERS } from "../lib/db/fixtures";

const REF_SOLUTION_PATH = path.join(process.cwd(), "scripts", "demo-problem", "reference_solution.py");

/**
 * Runs the trusted reference solution directly (NOT through the sandbox —
 * this is a trusted server-side authoring step run by a problem author,
 * not a candidate submission; see docs/ARCHITECTURE.md for why that
 * distinction matters) to derive the correct expected_output for a given
 * hidden input. This is the "reference solutions may be used to produce
 * expected outputs" behavior, for real.
 */
function computeExpected(input: string): string {
  const out = execFileSync("python3", [REF_SOLUTION_PATH], { input, encoding: "utf8", timeout: 10_000 });
  return out;
}

function buildInput(n: number, target: number, arr: number[]): string {
  return `${n} ${target}\n${arr.join(" ")}\n`;
}

async function main() {
  const pool = getPool("admin");
  const author = FIXTURE_USERS.author.id;

  const problemId = (
    await pool.query(
      `insert into public.problems (slug, title, owner_id, status)
       values ('pair-sum-equals-target', 'Count Pairs With Target Sum', $1, 'draft')
       on conflict (slug) do update set title = excluded.title
       returning id`,
      [author]
    )
  ).rows[0].id;

  const publicTests = [
    { input: buildInput(4, 5, [1, 4, 2, 3]), output: "2\n" },
    { input: buildInput(4, 9, [2, 7, 11, 15]), output: "1\n" },
  ];

  const spec = {
    statement:
      "Given n integers and a target, count pairs (i < j) whose values sum to target. " +
      "First line: n and target. Second line: n space-separated integers.",
    inputFormat: "n target\\n a_1 a_2 ... a_n",
    outputFormat: "A single integer: the number of valid pairs.",
    publicTests,
  };
  const constraints = {
    n: { min: 0, max: 200000 },
    value: { min: -1000000000, max: 1000000000 },
    target: { min: -1000000000, max: 1000000000 },
  };

  const problemVersionId = (
    await pool.query(
      `insert into public.problem_versions
         (problem_id, version_number, spec, constraints, function_style,
          time_limit_ms, memory_limit_mb, output_limit_kb, status, created_by)
       values ($1, 1, $2, $3, false, 2000, 256, 1024, 'draft', $4)
       returning id`,
      [problemId, JSON.stringify(spec), JSON.stringify(constraints), author]
    )
  ).rows[0].id;

  await pool.query(`update public.problems set current_problem_version_id = $1 where id = $2`, [
    problemVersionId,
    problemId,
  ]);

  const testSuiteId = (
    await pool.query(
      `insert into public.test_suites (problem_id, name) values ($1, 'default') returning id`,
      [problemId]
    )
  ).rows[0].id;

  const testSuiteVersionId = (
    await pool.query(
      `insert into public.test_suite_versions (test_suite_id, problem_version_id, version_number, status, created_by)
       values ($1, $2, 1, 'draft', $3) returning id`,
      [testSuiteId, problemVersionId, author]
    )
  ).rows[0].id;

  const refSolutionSource = readFileSync(REF_SOLUTION_PATH, "utf8");
  await pool.query(
    `insert into public.reference_solutions (problem_version_id, language, source_code, is_primary, validated, created_by)
     values ($1, 'python3', $2, true, true, $3)`,
    [problemVersionId, refSolutionSource, author]
  );

  // --- Build hidden tests. Every expected_output below is computed by
  // actually running the reference solution, not hand-derived. ---
  type HiddenSpec = {
    category: string;
    difficulty: "easy" | "medium" | "hard";
    weight: number;
    purpose: string;
    input: string;
    limits?: { timeMs?: number; memoryMb?: number; outputKb?: number };
  };

  const hidden: HiddenSpec[] = [
    {
      category: "basic",
      difficulty: "easy",
      weight: 1,
      purpose: "another simple case beyond the public examples",
      input: buildInput(5, 10, [5, 5, 1, 9, 2]),
    },
    {
      category: "basic",
      difficulty: "easy",
      weight: 1,
      purpose: "no pairs exist",
      input: buildInput(4, 100, [10, 20, 30, 40]),
    },
    { category: "boundary", difficulty: "easy", weight: 1, purpose: "empty array", input: buildInput(0, 5, []) },
    {
      category: "boundary",
      difficulty: "easy",
      weight: 1,
      purpose: "single element, no possible pair",
      input: buildInput(1, 5, [5]),
    },
    {
      category: "boundary",
      difficulty: "easy",
      weight: 1,
      purpose: "exactly two elements forming the target",
      input: buildInput(2, 10, [4, 6]),
    },
    {
      category: "edge",
      difficulty: "medium",
      weight: 2,
      purpose: "negative numbers, target zero",
      input: buildInput(4, 0, [-5, 5, 0, 0]),
    },
    {
      category: "edge",
      difficulty: "medium",
      weight: 2,
      purpose: "self-pair: target equals 2x for a repeated value (classic off-by bug trigger)",
      input: buildInput(3, 8, [4, 4, 4]),
    },
    {
      category: "adversarial",
      difficulty: "hard",
      weight: 3,
      purpose: "heavy duplicate multiplicity - catches set-instead-of-multiset bugs",
      input: buildInput(50, 2000, new Array(50).fill(1000)),
    },
    {
      category: "adversarial",
      difficulty: "hard",
      weight: 3,
      purpose: "duplicates present but NOT relevant to the target - catches over-eager duplicate logic",
      input: buildInput(41, 14, [7, ...new Array(40).fill(3)]),
    },
    {
      category: "large_input",
      difficulty: "hard",
      weight: 3,
      purpose: "n = 150000, exercises O(n) vs O(n^2) distinction",
      input: buildInput(
        150000,
        1000,
        Array.from({ length: 150000 }, (_, i) => i % 1000)
      ),
    },
    {
      category: "performance",
      difficulty: "hard",
      weight: 4,
      purpose: "same scale as large_input, tagged separately to keep performance scoring distinguishable from correctness-at-scale",
      input: buildInput(
        120000,
        500,
        Array.from({ length: 120000 }, (_, i) => (i * 7) % 500)
      ),
      limits: { timeMs: 2000 },
    },
    {
      category: "regression",
      difficulty: "medium",
      weight: 2,
      purpose: "regression: historical bug GH-142, self-pair duplicate overcount with target=0",
      input: buildInput(4, 0, [0, 0, 0, 0]),
    },
    {
      category: "special_condition",
      difficulty: "medium",
      weight: 2,
      purpose: "large-magnitude values near the declared integer bounds",
      input: buildInput(4, 0, [1000000000, -1000000000, 999999999, -999999999]),
    },
  ];

  for (const h of hidden) {
    const expected = computeExpected(h.input);
    await pool.query(
      `insert into public.hidden_test_cases
         (test_suite_version_id, category, difficulty, weight, purpose, input_data, expected_output,
          execution_limits, language_compat, source, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'human','active',$10)`,
      [
        testSuiteVersionId,
        h.category,
        h.difficulty,
        h.weight,
        h.purpose,
        h.input,
        expected,
        JSON.stringify(h.limits ?? {}),
        ["python3", "node"],
        author,
      ]
    );
  }

  // Validate -> publish (transactional; immutable once published).
  await pool.query(`update public.test_suite_versions set status = 'validated' where id = $1`, [testSuiteVersionId]);
  await pool.query(
    `update public.test_suite_versions set status = 'published', published_at = now() where id = $1`,
    [testSuiteVersionId]
  );
  await pool.query(`update public.problem_versions set status = 'published', published_at = now() where id = $1`, [
    problemVersionId,
  ]);
  await pool.query(`update public.problems set status = 'published' where id = $1`, [problemId]);

  console.log("Seeded demo problem:");
  console.log(`  problem_id            = ${problemId}`);
  console.log(`  problem_version_id    = ${problemVersionId}`);
  console.log(`  test_suite_version_id = ${testSuiteVersionId}`);
  console.log(`  hidden tests inserted = ${hidden.length}`);

  await closeAllPools();

  // Emit machine-readable ids for other scripts to consume.
  writeFileSync(
    path.join(process.cwd(), ".demo-problem-ids.json"),
    JSON.stringify({ problemId, problemVersionId, testSuiteVersionId }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
