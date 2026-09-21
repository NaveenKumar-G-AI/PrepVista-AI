import { test, assert, assertEqual } from "./harness.js";
import { runTestCase } from "../src/execution/executor.js";
import { SupportedLanguage, TestCategory } from "../src/domain/types.js";

const tc = (input: unknown[], expectedOutput: unknown, id = "t1") => ({
  id,
  category: TestCategory.NORMAL,
  input,
  expectedOutput,
  hidden: false,
  points: 1,
});

test("executor: python correct solution passes", () => {
  const { result } = runTestCase(SupportedLanguage.PYTHON, "def add(a, b):\n    return a + b\n", "add", "exact", tc([2, 3], 5));
  assert(result.passed, "expected pass");
});

test("executor: python wrong output fails without error", () => {
  const { result } = runTestCase(SupportedLanguage.PYTHON, "def add(a, b):\n    return a - b\n", "add", "exact", tc([2, 3], 5));
  assert(!result.passed);
  assert(!result.errorKind, "a value mismatch should not carry an errorKind");
});

test("executor: python runtime error is classified and captured", () => {
  const { result } = runTestCase(SupportedLanguage.PYTHON, "def add(a, b):\n    return a[0] + b\n", "add", "exact", tc([2, 3], 5));
  assert(!result.passed);
  assertEqual(result.errorKind, "runtime_error");
  assert((result.errorMessage ?? "").includes("TypeError"), `expected TypeError in message, got: ${result.errorMessage}`);
});

test("executor: python syntax error is a compile_error", () => {
  const { result } = runTestCase(SupportedLanguage.PYTHON, "def add(a, b)\n    return a + b\n", "add", "exact", tc([2, 3], 5));
  assert(!result.passed);
  assertEqual(result.errorKind, "compile_error");
});

test("executor: infinite loop is stopped by resource limits, not left hanging", () => {
  const start = Date.now();
  const { result } = runTestCase(
    SupportedLanguage.PYTHON,
    "def add(a, b):\n    x = 0\n    while True:\n        x += 1\n    return x\n",
    "add",
    "exact",
    tc([2, 3], 5),
    { wallTimeMs: 2000, cpuTimeSec: 1, memoryKB: 262144, heapMB: 128 },
  );
  const elapsed = Date.now() - start;
  assert(!result.passed);
  assertEqual(result.errorKind, "resource_limit");
  assert(elapsed < 4000, `expected the call to return well under the wall-time backstop, took ${elapsed}ms`);
});

test("executor: javascript correct solution passes", () => {
  const { result } = runTestCase(SupportedLanguage.JAVASCRIPT, "export function add(a, b) { return a + b; }", "add", "exact", tc([2, 3], 5));
  assert(result.passed);
});

test("executor: javascript missing export is classified", () => {
  const { result } = runTestCase(SupportedLanguage.JAVASCRIPT, "export function nope(a, b) { return a + b; }", "add", "exact", tc([2, 3], 5));
  assert(!result.passed);
  assertEqual(result.errorKind, "runtime_error");
});

test("executor: hidden test never leaks actual/expected values even on failure", () => {
  const hiddenTc = { id: "h1", category: TestCategory.NORMAL, input: [2, 3], expectedOutput: 999, hidden: true, points: 1 };
  const { result } = runTestCase(SupportedLanguage.PYTHON, "def add(a, b):\n    return a + b\n", "add", "exact", hiddenTc);
  assert(!result.passed);
  assertEqual(result.actualOutput, undefined);
  assertEqual(result.expectedOutput, undefined);
});

test("executor: unordered_collection comparison ignores order", () => {
  const { result } = runTestCase(
    SupportedLanguage.PYTHON,
    "def ids(a):\n    return list(reversed(a))\n",
    "ids",
    "unordered_collection",
    tc([[1, 2, 3]], [1, 2, 3]),
  );
  assert(result.passed, "reversed list should still match under unordered_collection comparison");
});

test("executor: java correct solution passes (primitive params)", () => {
  const { result } = runTestCase(SupportedLanguage.JAVA, "class Solution { public static int add(int a, int b) { return a + b; } }", "add", "exact", tc([2, 3], 5));
  assert(result.passed);
});

test("executor: java wrong output fails without error", () => {
  const { result } = runTestCase(SupportedLanguage.JAVA, "class Solution { public static int add(int a, int b) { return a - b; } }", "add", "exact", tc([2, 3], 5));
  assert(!result.passed);
  assert(!result.errorKind);
});

test("executor: java runtime exception is classified", () => {
  const { result } = runTestCase(SupportedLanguage.JAVA, "class Solution { public static int divide(int a, int b) { return a / b; } }", "divide", "exact", tc([10, 0], 5));
  assert(!result.passed);
  assertEqual(result.errorKind, "runtime_error");
  assert((result.errorMessage ?? "").includes("ArithmeticException"), `expected ArithmeticException, got: ${result.errorMessage}`);
});

test("executor: java compile error in student code is classified (not a system error)", () => {
  const { result } = runTestCase(SupportedLanguage.JAVA, "class Solution { public static int add(int a, int b) { return a + b } }", "add", "exact", tc([2, 3], 5));
  assert(!result.passed);
  assertEqual(result.errorKind, "compile_error");
});

test("executor: java int[] parameter and return type marshal correctly", () => {
  const { result } = runTestCase(
    SupportedLanguage.JAVA,
    "class Solution { public static int[] doubleAll(int[] n) { int[] r = new int[n.length]; for (int i=0;i<n.length;i++) r[i]=n[i]*2; return r; } }",
    "doubleAll",
    "exact",
    tc([[1, 2, 3]], [2, 4, 6]),
  );
  assert(result.passed, `expected pass, got ${JSON.stringify(result)}`);
});

test("executor: java raw List/Map parameters marshal correctly", () => {
  const { result } = runTestCase(
    SupportedLanguage.JAVA,
    'class Solution { public static String getEmail(Map m) { return (String) m.get("email"); } }',
    "getEmail",
    "exact",
    tc([{ email: "a@b.com" }], "a@b.com"),
  );
  assert(result.passed, `expected pass, got ${JSON.stringify(result)}`);
});

test("executor: java infinite loop is stopped by resource limits", () => {
  const { result } = runTestCase(
    SupportedLanguage.JAVA,
    "class Solution { public static int loop(int a) { long x = 0; while (true) { x++; } } }",
    "loop",
    "exact",
    tc([1], 1),
    { wallTimeMs: 2500, cpuTimeSec: 1, memoryKB: 262144, heapMB: 128 },
  );
  assert(!result.passed);
  assertEqual(result.errorKind, "resource_limit");
});
