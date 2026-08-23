import { describe, it, expect } from "vitest";
import { evaluate, evaluateStudent } from "../src/evaluate.js";
import type { RuleNode } from "../src/types.js";
import { makeStudent } from "./fixtures.js";

const cgpaRule: RuleNode = {
  kind: "LEAF", id: "cgpa", field: "cgpa", comparator: "GTE", value: 7.0, category: "CGPA", label: "CGPA",
};

describe("CGPA boundary", () => {
  it("passes exactly at the boundary", () => {
    expect(evaluate(cgpaRule, makeStudent({ cgpa: 7.0 }))).toBe(true);
  });
  it("fails just below the boundary", () => {
    expect(evaluate(cgpaRule, makeStudent({ cgpa: 6.99 }))).toBe(false);
  });
  it("passes just above the boundary", () => {
    expect(evaluate(cgpaRule, makeStudent({ cgpa: 7.01 }))).toBe(true);
  });
});

const backlogRule: RuleNode = {
  kind: "LEAF", id: "backlog", field: "activeBacklogs", comparator: "LTE", value: 0, category: "BACKLOG", label: "Active backlogs",
};

describe("Backlog boundary", () => {
  it("passes at zero", () => {
    expect(evaluate(backlogRule, makeStudent({ activeBacklogs: 0 }))).toBe(true);
  });
  it("fails at one", () => {
    expect(evaluate(backlogRule, makeStudent({ activeBacklogs: 1 }))).toBe(false);
  });
});

const deptRule: RuleNode = {
  kind: "LEAF", id: "dept", field: "department", comparator: "IN", value: ["CSE", "IT", "ECE"], category: "DEPARTMENT", label: "Department",
};

describe("Department IN", () => {
  it("passes when department is in the list", () => {
    expect(evaluate(deptRule, makeStudent({ department: "IT" }))).toBe(true);
  });
  it("fails when department is not in the list", () => {
    expect(evaluate(deptRule, makeStudent({ department: "MECH" }))).toBe(false);
  });
});

describe("AND composition", () => {
  const rule: RuleNode = { kind: "AND", id: "and1", children: [cgpaRule, backlogRule, deptRule] };
  it("requires every child to pass", () => {
    expect(evaluate(rule, makeStudent({ cgpa: 8, activeBacklogs: 0, department: "CSE" }))).toBe(true);
    expect(evaluate(rule, makeStudent({ cgpa: 6, activeBacklogs: 0, department: "CSE" }))).toBe(false);
  });
});

describe("OR composition", () => {
  const skillA: RuleNode = { kind: "LEAF", id: "skillA", field: "skills", comparator: "HAS", value: "Python", category: "OTHER" };
  const skillB: RuleNode = { kind: "LEAF", id: "skillB", field: "skills", comparator: "HAS", value: "Java", category: "OTHER" };
  const rule: RuleNode = { kind: "OR", id: "or1", children: [skillA, skillB] };
  it("passes when at least one child passes", () => {
    expect(evaluate(rule, makeStudent({ skills: ["Java"] }))).toBe(true);
    expect(evaluate(rule, makeStudent({ skills: ["Go"] }))).toBe(false);
  });
});

describe("NOT composition", () => {
  const placedRule: RuleNode = { kind: "LEAF", id: "placed", field: "placementStatus", comparator: "EQ", value: "PLACED", category: "OTHER" };
  const rule: RuleNode = { kind: "NOT", id: "not1", child: placedRule };
  it("flips the child result", () => {
    expect(evaluate(rule, makeStudent({ placementStatus: "PLACED" }))).toBe(false);
    expect(evaluate(rule, makeStudent({ placementStatus: "UNPLACED" }))).toBe(true);
  });
});

describe("Nested groups", () => {
  const rule: RuleNode = {
    kind: "AND", id: "root",
    children: [
      deptRule,
      cgpaRule,
      { kind: "NOT", id: "notPlaced", child: { kind: "LEAF", id: "placed2", field: "placementStatus", comparator: "EQ", value: "PLACED", category: "OTHER" } },
      { kind: "OR", id: "gradYear", children: [
        { kind: "LEAF", id: "gy2026", field: "graduationYear", comparator: "EQ", value: 2026, category: "OTHER" },
        { kind: "LEAF", id: "gy2027", field: "graduationYear", comparator: "EQ", value: 2027, category: "OTHER" },
      ] },
    ],
  };
  it("evaluates a 3-level nested tree correctly", () => {
    const eligible = makeStudent({ department: "CSE", cgpa: 8, placementStatus: "UNPLACED", graduationYear: 2026 });
    expect(evaluate(rule, eligible)).toBe(true);
    const notEligible = makeStudent({ department: "CSE", cgpa: 8, placementStatus: "PLACED", graduationYear: 2026 });
    expect(evaluate(rule, notEligible)).toBe(false);
  });
});

describe("Multiple failed rules -> primary failure reason", () => {
  const rule: RuleNode = { kind: "AND", id: "root2", children: [cgpaRule, backlogRule, deptRule] };
  it("picks CGPA over backlog and department when all three fail", () => {
    const result = evaluateStudent(makeStudent({ cgpa: 5, activeBacklogs: 2, department: "MECH" }), rule, 1);
    expect(result.eligible).toBe(false);
    expect(result.primaryFailureCategory).toBe("CGPA");
    expect(result.failedLeaves.map((l) => l.category).sort()).toEqual(["BACKLOG", "CGPA", "DEPARTMENT"]);
  });
  it("picks backlog over department when CGPA passes", () => {
    const result = evaluateStudent(makeStudent({ cgpa: 8, activeBacklogs: 2, department: "MECH" }), rule, 1);
    expect(result.primaryFailureCategory).toBe("BACKLOG");
  });
  it("returns a null primary reason for eligible students", () => {
    const result = evaluateStudent(makeStudent({ cgpa: 8, activeBacklogs: 0, department: "CSE" }), rule, 1);
    expect(result.eligible).toBe(true);
    expect(result.primaryFailureCategory).toBeNull();
  });
});
