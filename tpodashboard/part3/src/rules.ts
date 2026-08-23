import type { RuleLeaf, Student, LeafExplanation } from "./types.js";

function getActual(student: Student, field: RuleLeaf["field"]): unknown {
  return (student as unknown as Record<string, unknown>)[field];
}

export function evaluateLeafRaw(leaf: RuleLeaf, student: Student): { passed: boolean; actual: unknown } {
  const actual = getActual(student, leaf.field);
  switch (leaf.comparator) {
    case "GTE":
      return { passed: typeof actual === "number" && actual >= (leaf.value as number), actual };
    case "GT":
      return { passed: typeof actual === "number" && actual > (leaf.value as number), actual };
    case "LTE":
      return { passed: typeof actual === "number" && actual <= (leaf.value as number), actual };
    case "LT":
      return { passed: typeof actual === "number" && actual < (leaf.value as number), actual };
    case "EQ":
      return { passed: actual === leaf.value, actual };
    case "NEQ":
      return { passed: actual !== leaf.value, actual };
    case "IN":
      return {
        passed: Array.isArray(leaf.value) && typeof actual !== "undefined" && (leaf.value as string[]).includes(String(actual)),
        actual,
      };
    case "NOT_IN":
      return {
        passed: Array.isArray(leaf.value) && (typeof actual === "undefined" || !(leaf.value as string[]).includes(String(actual))),
        actual,
      };
    case "HAS":
      return { passed: Array.isArray(actual) && (actual as unknown[]).includes(leaf.value), actual };
    case "HAS_ALL":
      return {
        passed:
          Array.isArray(actual) &&
          Array.isArray(leaf.value) &&
          (leaf.value as string[]).every((v) => (actual as unknown[]).includes(v)),
        actual,
      };
    default:
      return { passed: false, actual };
  }
}

function comparatorSymbol(c: RuleLeaf["comparator"]): string {
  switch (c) {
    case "GTE": return ">=";
    case "GT": return ">";
    case "LTE": return "<=";
    case "LT": return "<";
    case "EQ": return "=";
    case "NEQ": return "!=";
    case "IN": return "in";
    case "NOT_IN": return "not in";
    case "HAS": return "includes";
    case "HAS_ALL": return "includes all of";
    default: return c;
  }
}

export function describeLeaf(leaf: RuleLeaf, actual: unknown, passed: boolean): string {
  const label = leaf.label ?? leaf.field;
  const actualStr = Array.isArray(actual) ? actual.join(", ") : String(actual ?? "\u2014");
  const expectedStr = Array.isArray(leaf.value) ? leaf.value.join(", ") : String(leaf.value);
  const mark = passed ? "PASS" : "FAIL";
  return `[${mark}] ${label}: ${actualStr} ${comparatorSymbol(leaf.comparator)} ${expectedStr}`;
}

export function evaluateLeaf(leaf: RuleLeaf, student: Student): LeafExplanation {
  const { passed, actual } = evaluateLeafRaw(leaf, student);
  return {
    leafId: leaf.id,
    field: leaf.field,
    comparator: leaf.comparator,
    expected: leaf.value,
    actual,
    passed,
    category: leaf.category,
    description: describeLeaf(leaf, actual, passed),
  };
}
