import { runInSandbox } from "../sandbox/runner";
import { compareOutputs } from "../engine/comparators";
import { generateMutants } from "./mutators";
import type { Pool } from "pg";

export interface MutationReport {
  mutantsTotal: number;
  mutantsKilled: number;
  detectionRate: number; // real, computed — never asserted without this computation running
  details: Array<{
    mutantId: string;
    description: string;
    killed: boolean;
    killedByTestCategory?: string;
  }>;
}

/**
 * Mutation testing is challenge-validation only: it runs REFERENCE-
 * derived mutants against the hidden suite to check the suite's own
 * strength. It never touches student submissions or production
 * candidate data (see docs/ARCHITECTURE.md#mutation-safety) — the only
 * "candidate code" it ever executes is a mutated copy of the trusted
 * reference solution, generated in-memory and discarded after.
 */
export async function runMutationTesting(
  pool: Pool,
  testSuiteVersionId: string,
  referenceSource: string,
  language: string,
  defaultLimits: { timeMs: number; memoryMb: number; outputKb: number }
): Promise<MutationReport> {
  const { rows: hiddenTests } = await pool.query(
    `select input_data, expected_output, category, execution_limits
     from public.hidden_test_cases
     where test_suite_version_id = $1 and enabled = true and status = 'active'`,
    [testSuiteVersionId]
  );

  const mutants = generateMutants(referenceSource);
  const details: MutationReport["details"] = [];

  for (const mutant of mutants) {
    let killed = false;
    let killedByTestCategory: string | undefined;

    for (const test of hiddenTests) {
      const limits = { ...defaultLimits, ...(test.execution_limits ?? {}) };
      const result = await runInSandbox({
        language,
        sourceCode: mutant.mutatedSource,
        stdin: test.input_data,
        limits,
      });

      if (result.outcome !== "ok") {
        killed = true;
        killedByTestCategory = test.category;
        break;
      }
      const cmp = compareOutputs(result.stdout, test.expected_output, { kind: "whitespace_normalized" });
      if (!cmp.matches) {
        killed = true;
        killedByTestCategory = test.category;
        break;
      }
    }

    details.push({ mutantId: mutant.id, description: mutant.description, killed, killedByTestCategory });
  }

  const mutantsKilled = details.filter((d) => d.killed).length;
  return {
    mutantsTotal: mutants.length,
    mutantsKilled,
    detectionRate: mutants.length === 0 ? 0 : Math.round((mutantsKilled / mutants.length) * 10000) / 100,
    details,
  };
}
