import { describe, it, expect } from "vitest";
import { validateRuleTree, isRuleTreeValid } from "../src/validate.js";
import type { RuleNode } from "../src/types.js";

describe("Rule tree validation", () => {
  it("accepts a well-formed leaf", () => {
    const rule: RuleNode = { kind: "LEAF", id: "a", field: "cgpa", comparator: "GTE", value: 7, category: "CGPA" };
    expect(isRuleTreeValid(rule)).toBe(true);
  });

  it("rejects an unknown field", () => {
    const rule = { kind: "LEAF", id: "a", field: "favoriteColor", comparator: "EQ", value: "blue", category: "OTHER" } as unknown as RuleNode;
    const issues = validateRuleTree(rule);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toMatch(/Unknown field/);
  });

  it("rejects a numeric field compared with a list comparator", () => {
    const rule: RuleNode = { kind: "LEAF", id: "a", field: "cgpa", comparator: "IN", value: ["7"], category: "CGPA" };
    expect(isRuleTreeValid(rule)).toBe(false);
  });

  it("rejects a numeric field with a non-numeric value", () => {
    const rule = { kind: "LEAF", id: "a", field: "cgpa", comparator: "GTE", value: "seven", category: "CGPA" } as unknown as RuleNode;
    expect(isRuleTreeValid(rule)).toBe(false);
  });

  it("rejects an empty AND group", () => {
    const rule: RuleNode = { kind: "AND", id: "g", children: [] };
    expect(isRuleTreeValid(rule)).toBe(false);
  });

  it("recurses into nested groups and NOT", () => {
    const rule: RuleNode = {
      kind: "AND", id: "g",
      children: [
        { kind: "NOT", id: "n", child: { kind: "LEAF", id: "bad", field: "cgpa", comparator: "HAS", value: 7, category: "CGPA" } },
      ],
    };
    expect(isRuleTreeValid(rule)).toBe(false);
  });

  it("flags trees deeper than the nesting limit", () => {
    let node: RuleNode = { kind: "LEAF", id: "leaf", field: "cgpa", comparator: "GTE", value: 1, category: "CGPA" };
    for (let i = 0; i < 15; i++) {
      node = { kind: "NOT", id: `n${i}`, child: node };
    }
    expect(isRuleTreeValid(node)).toBe(false);
  });
});
