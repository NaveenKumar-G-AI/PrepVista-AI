/**
 * Zero-dependency test harness. Node's built-in test runner (node:test) is an option on
 * Node 22, but this project intentionally has *zero* runtime or dev dependencies beyond
 * tsx to execute .ts directly, and this harness is ~40 lines — simpler than wiring up a
 * runner flag matrix. Every tests/*.test.ts file imports { test, run } from here.
 */
import assert from 'node:assert/strict';

export { assert };

type TestFn = () => void | Promise<void>;
interface Case {
  name: string;
  fn: TestFn;
}
const cases: Case[] = [];

export function test(name: string, fn: TestFn): void {
  cases.push({ name, fn });
}

export async function run(suiteName: string): Promise<void> {
  let passed = 0;
  let failed = 0;
  const failures: { name: string; error: unknown }[] = [];

  for (const c of cases) {
    try {
      await c.fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${c.name}`);
    } catch (err) {
      failed++;
      failures.push({ name: c.name, error: err });
      console.log(`  \x1b[31m✗\x1b[0m ${c.name}`);
    }
  }

  console.log(`\n${suiteName}: ${passed} passed, ${failed} failed (${cases.length} total)\n`);

  for (const f of failures) {
    console.log(`--- ${f.name} ---`);
    console.log(f.error instanceof Error ? f.error.stack || f.error.message : f.error);
    console.log('');
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}
