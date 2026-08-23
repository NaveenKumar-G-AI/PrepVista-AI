import type { RuleNode, Student, LeafExplanation, EligibilityResult, FailureCategory } from "./types.js";
import { evaluateLeaf } from "./rules.js";

/**
 * Computes the true boolean eligibility result for a rule tree, honoring
 * AND / OR / NOT semantics via direct recursion. This is intentionally
 * separate from explain() below so the pass/fail boolean can never be
 * corrupted by the negation-tracking used for human-readable output.
 */
export function evaluate(node: RuleNode, student: Student): boolean {
  if (node.kind === "LEAF") return evaluateLeaf(node, student).passed;
  if (node.kind === "NOT") return !evaluate(node.child, student);
  if (node.kind === "AND") return node.children.every((c) => evaluate(c, student));
  return node.children.some((c) => evaluate(c, student)); // OR
}

function negateDescription(description: string): string {
  return description.startsWith("[PASS]")
    ? description.replace("[PASS]", "[FAIL]") + " (negated)"
    : description.replace("[FAIL]", "[PASS]") + " (negated)";
}

/**
 * Walks the tree and returns a flat list of leaf-level explanations.
 * `negated` is flipped at every NOT boundary so a leaf nested under an
 * odd number of NOTs is reported with its *effective* pass/fail, not its
 * raw comparator result.
 */
export function explain(node: RuleNode, student: Student, negated = false): LeafExplanation[] {
  if (node.kind === "LEAF") {
    const raw = evaluateLeaf(node, student);
    if (!negated) return [raw];
    return [{ ...raw, passed: !raw.passed, description: negateDescription(raw.description) }];
  }
  if (node.kind === "NOT") return explain(node.child, student, !negated);
  return node.children.flatMap((c) => explain(c, student, negated));
}

const CATEGORY_PRIORITY: FailureCategory[] = ["CGPA", "BACKLOG", "DEPARTMENT", "OTHER"];

export function pickPrimaryFailureCategory(failed: LeafExplanation[]): FailureCategory | null {
  if (failed.length === 0) return null;
  for (const category of CATEGORY_PRIORITY) {
    if (failed.some((f) => f.category === category)) return category;
  }
  return "OTHER";
}

export function evaluateStudent(student: Student, rule: RuleNode, ruleVersion: number): EligibilityResult {
  const eligible = evaluate(rule, student);
  const leafResults = explain(rule, student);
  const failedLeaves = leafResults.filter((l) => !l.passed);
  return {
    studentId: student.id,
    eligible,
    leafResults,
    failedLeaves,
    primaryFailureCategory: eligible ? null : pickPrimaryFailureCategory(failedLeaves),
    ruleVersion,
    evaluatedAt: new Date().toISOString(),
  };
}
