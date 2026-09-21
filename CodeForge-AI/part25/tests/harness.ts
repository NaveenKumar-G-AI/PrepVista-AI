/**
 * Minimal, dependency-free test harness. Deliberately not jest/vitest —
 * this package has exactly one devDependency (typescript) so `npm test`
 * is fast and has nothing external to break.
 */

type TestFn = () => void | Promise<void>;
interface TestCase {
  name: string;
  fn: TestFn;
}
const registry: TestCase[] = [];

export function test(name: string, fn: TestFn): void {
  registry.push({ name, fn });
}

export function assertTrue(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
export function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) throw new Error(`Assertion failed: ${msg} (expected "${b}", got "${a}")`);
}
export function assertGreater(a: number, b: number, msg: string): void {
  if (!(a > b)) throw new Error(`Assertion failed: ${msg} (expected ${a} > ${b})`);
}
export function assertLess(a: number, b: number, msg: string): void {
  if (!(a < b)) throw new Error(`Assertion failed: ${msg} (expected ${a} < ${b})`);
}

export async function runAll(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const t of registry) {
    try {
      await t.fn();
      pass++;
      console.log(`  ok   - ${t.name}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL - ${t.name}`);
      console.log(`         ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed, ${registry.length} total`);
  if (fail > 0) process.exit(1);
}
