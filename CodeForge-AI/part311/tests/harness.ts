type TestFn = () => void | Promise<void>;
const tests: { name: string; fn: TestFn }[] = [];

export function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

export function assert(cond: boolean, msg = "assertion failed"): void {
  if (!cond) throw new Error(msg);
}

export function assertEqual(actual: unknown, expected: unknown, msg?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? "assertEqual failed"}: expected ${e}, got ${a}`);
}

export async function runAll(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  \u2713 ${t.name}`);
      pass++;
    } catch (e) {
      console.log(`  \u2717 ${t.name}`);
      console.log(`      ${e instanceof Error ? e.message : String(e)}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  if (fail > 0) process.exitCode = 1;
}
