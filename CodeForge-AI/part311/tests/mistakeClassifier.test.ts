import { test, assert, assertEqual } from "./harness.js";
import { classifyMistakes, updateMisconceptions } from "../src/engine/mistakeClassifier.js";
import { MistakeCategory, TestCategory, type TestResult } from "../src/domain/types.js";

function tr(overrides: Partial<TestResult>): TestResult {
  return { testId: "t", category: TestCategory.NORMAL, hidden: false, passed: true, ...overrides };
}

test("mistakeClassifier: all passing -> no mistakes", () => {
  const result = classifyMistakes([tr({ passed: true }), tr({ passed: true })]);
  assertEqual(result, []);
});

test("mistakeClassifier: edge/boundary-only failures with normal passing -> OFF_BY_ONE + BOUNDARY_ERROR", () => {
  const result = classifyMistakes([
    tr({ testId: "n1", category: TestCategory.NORMAL, passed: true }),
    tr({ testId: "b1", category: TestCategory.BOUNDARY, passed: false }),
  ]);
  assert(result.includes(MistakeCategory.OFF_BY_ONE));
  assert(result.includes(MistakeCategory.BOUNDARY_ERROR));
});

test("mistakeClassifier: failing on NORMAL tests too -> WRONG_ALGORITHM, not OFF_BY_ONE", () => {
  const result = classifyMistakes([tr({ testId: "n1", category: TestCategory.NORMAL, passed: false })]);
  assert(result.includes(MistakeCategory.WRONG_ALGORITHM));
  assert(!result.includes(MistakeCategory.OFF_BY_ONE));
});

test("mistakeClassifier: IndexError -> BOUNDARY_ERROR", () => {
  const result = classifyMistakes([tr({ passed: false, errorKind: "runtime_error", errorMessage: "IndexError: list index out of range" })]);
  assertEqual(result, [MistakeCategory.BOUNDARY_ERROR]);
});

test("mistakeClassifier: TypeError -> TYPE_ERROR", () => {
  const result = classifyMistakes([tr({ passed: false, errorKind: "runtime_error", errorMessage: "TypeError: unsupported operand" })]);
  assertEqual(result, [MistakeCategory.TYPE_ERROR]);
});

test("mistakeClassifier: KeyError -> WRONG_DATA_STRUCTURE", () => {
  const result = classifyMistakes([tr({ passed: false, errorKind: "runtime_error", errorMessage: "KeyError: 'email'" })]);
  assertEqual(result, [MistakeCategory.WRONG_DATA_STRUCTURE]);
});

test("mistakeClassifier: resource limit -> COMPLEXITY_FAILURE", () => {
  const result = classifyMistakes([tr({ passed: false, errorKind: "resource_limit", errorMessage: "execution stopped: exceeded the allotted time or memory" })]);
  assertEqual(result, [MistakeCategory.COMPLEXITY_FAILURE]);
});

test("mistakeClassifier: system_error is never recorded as a student mistake", () => {
  const result = classifyMistakes([tr({ passed: false, errorKind: "system_error", errorMessage: "platform error" })]);
  assertEqual(result, [MistakeCategory.UNKNOWN]);
});

test("misconceptions: 1 occurrence stays unflagged (LOW, but not yet 'active')", () => {
  const records = updateMisconceptions([], "s1", "data_structures.hashing", MistakeCategory.OFF_BY_ONE, { attemptId: "a1", detail: "d" }, "t1");
  assertEqual(records[0]!.occurrences, 1);
  assertEqual(records[0]!.confidence, "LOW");
});

test("misconceptions: 3rd occurrence of the same category -> MEDIUM confidence (matches §28's example exactly)", () => {
  let records = updateMisconceptions([], "s1", "data_structures.hashing", MistakeCategory.OFF_BY_ONE, { attemptId: "a1", detail: "d" }, "t1");
  records = updateMisconceptions(records, "s1", "data_structures.hashing", MistakeCategory.OFF_BY_ONE, { attemptId: "a2", detail: "d" }, "t2");
  records = updateMisconceptions(records, "s1", "data_structures.hashing", MistakeCategory.OFF_BY_ONE, { attemptId: "a3", detail: "d" }, "t3");
  assertEqual(records[0]!.occurrences, 3);
  assertEqual(records[0]!.confidence, "MEDIUM");
});

test("misconceptions: 4th occurrence escalates to HIGH", () => {
  let records = updateMisconceptions([], "s1", "engineering.debugging", MistakeCategory.NULL_HANDLING, { attemptId: "a1", detail: "d" }, "t1");
  for (let i = 2; i <= 4; i++) {
    records = updateMisconceptions(records, "s1", "engineering.debugging", MistakeCategory.NULL_HANDLING, { attemptId: `a${i}`, detail: "d" }, `t${i}`);
  }
  assertEqual(records[0]!.confidence, "HIGH");
});

test("misconceptions: different categories on the same skill track independently", () => {
  let records = updateMisconceptions([], "s1", "data_structures.hashing", MistakeCategory.OFF_BY_ONE, { attemptId: "a1", detail: "d" }, "t1");
  records = updateMisconceptions(records, "s1", "data_structures.hashing", MistakeCategory.TYPE_ERROR, { attemptId: "a2", detail: "d" }, "t2");
  assertEqual(records.length, 2);
});

test("misconceptions: UNKNOWN category is never tracked", () => {
  const records = updateMisconceptions([], "s1", "data_structures.hashing", MistakeCategory.UNKNOWN, { attemptId: "a1", detail: "d" }, "t1");
  assertEqual(records, []);
});
