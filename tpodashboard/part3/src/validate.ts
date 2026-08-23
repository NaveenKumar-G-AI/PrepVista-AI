import type { RuleNode, EligibilityField, Comparator } from "./types.js";

const NUMERIC_FIELDS: EligibilityField[] = [
  "cgpa", "tenthPercentage", "twelfthPercentage", "diplomaPercentage",
  "activeBacklogs", "totalBacklogs", "graduationYear", "semester",
  "internshipCount", "experienceMonths",
];
const CATEGORICAL_FIELDS: EligibilityField[] = ["department", "program", "course", "placementStatus"];
const ARRAY_FIELDS: EligibilityField[] = ["skills", "certifications"];

const NUMERIC_COMPARATORS: Comparator[] = ["EQ", "NEQ", "GTE", "GT", "LTE", "LT"];
const CATEGORICAL_COMPARATORS: Comparator[] = ["EQ", "NEQ", "IN", "NOT_IN"];
const ARRAY_COMPARATORS: Comparator[] = ["HAS", "HAS_ALL"];

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateRuleTree(node: RuleNode, path = "root", depth = 0): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (depth > 12) {
    issues.push({ path, message: "Rule tree exceeds maximum nesting depth (12)." });
    return issues;
  }

  if (node.kind === "LEAF") {
    if (!node.id) issues.push({ path, message: "Leaf is missing an id." });

    if (NUMERIC_FIELDS.includes(node.field)) {
      if (!NUMERIC_COMPARATORS.includes(node.comparator)) {
        issues.push({ path, message: `Field "${node.field}" does not support comparator "${node.comparator}".` });
      }
      if (typeof node.value !== "number") {
        issues.push({ path, message: `Field "${node.field}" requires a numeric value.` });
      }
    } else if (CATEGORICAL_FIELDS.includes(node.field)) {
      if (!CATEGORICAL_COMPARATORS.includes(node.comparator)) {
        issues.push({ path, message: `Field "${node.field}" does not support comparator "${node.comparator}".` });
      } else {
        const needsArray = node.comparator === "IN" || node.comparator === "NOT_IN";
        if (needsArray && !Array.isArray(node.value)) {
          issues.push({ path, message: `Comparator "${node.comparator}" requires a list value.` });
        }
        if (!needsArray && typeof node.value !== "string") {
          issues.push({ path, message: `Field "${node.field}" requires a string value for "${node.comparator}".` });
        }
      }
    } else if (ARRAY_FIELDS.includes(node.field)) {
      if (!ARRAY_COMPARATORS.includes(node.comparator)) {
        issues.push({ path, message: `Field "${node.field}" does not support comparator "${node.comparator}".` });
      } else if (node.comparator === "HAS" && Array.isArray(node.value)) {
        issues.push({ path, message: `Comparator "HAS" requires a single value, not a list.` });
      } else if (node.comparator === "HAS_ALL" && !Array.isArray(node.value)) {
        issues.push({ path, message: `Comparator "HAS_ALL" requires a list value.` });
      }
    } else {
      issues.push({ path, message: `Unknown field "${node.field}".` });
    }
    return issues;
  }

  if (node.kind === "NOT") {
    return validateRuleTree(node.child, `${path}.NOT`, depth + 1);
  }

  // AND / OR
  if (!node.children || node.children.length === 0) {
    issues.push({ path, message: `${node.kind} group must have at least one child.` });
    return issues;
  }
  node.children.forEach((child, i) => {
    issues.push(...validateRuleTree(child, `${path}.${node.kind}[${i}]`, depth + 1));
  });
  return issues;
}

export function isRuleTreeValid(node: RuleNode): boolean {
  return validateRuleTree(node).length === 0;
}
