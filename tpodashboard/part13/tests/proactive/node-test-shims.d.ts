// Minimal ambient declarations for Node's built-in test runner and strict
// assert module. This sandbox has no network access to install
// @types/node; tsx runs these test files fine without any type
// declarations at all (it only strips types, it doesn't check them), but
// this shim lets `tsc --noEmit` also pass cleanly on the test files
// themselves. In your real repo, just add @types/node as a devDependency
// and delete this file.

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  interface StrictAssert {
    (value: unknown, message?: string | Error): asserts value;
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): asserts value;
    deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  }
  const assert: StrictAssert;
  export default assert;
}
