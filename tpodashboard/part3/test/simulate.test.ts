import { describe, it, expect } from "vitest";
import { simulateEligibility } from "../src/simulate.js";
import { summarizeCohort } from "../src/summarize.js";
import type { RuleNode, Student } from "../src/types.js";
import { makeStudent } from "./fixtures.js";

function ruleFor(cgpaMin: number, maxBacklog: number, depts: string[]): RuleNode {
  return {
    kind: "AND", id: "r",
    children: [
      { kind: "LEAF", id: "c", field: "cgpa", comparator: "GTE", value: cgpaMin, category: "CGPA" },
      { kind: "LEAF", id: "b", field: "activeBacklogs", comparator: "LTE", value: maxBacklog, category: "BACKLOG" },
      { kind: "LEAF", id: "d", field: "department", comparator: "IN", value: depts, category: "DEPARTMENT" },
    ],
  };
}

const students: Student[] = [
  makeStudent({ id: "1", cgpa: 6.7, activeBacklogs: 0, department: "CSE" }),
  makeStudent({ id: "2", cgpa: 8.0, activeBacklogs: 0, department: "ECE" }),
  makeStudent({ id: "3", cgpa: 8.0, activeBacklogs: 0, department: "CSE" }),
  makeStudent({ id: "4", cgpa: 5.0, activeBacklogs: 0, department: "CSE" }),
];

describe("What-if simulation", () => {
  const baseline = ruleFor(7.0, 0, ["CSE", "IT"]);
  const candidate = ruleFor(6.5, 1, ["CSE", "IT", "ECE"]);

  it("computes newly-eligible and removed sets without mutating inputs", () => {
    const before = JSON.stringify(students);
    const result = simulateEligibility(students, baseline, candidate, { baseline: 1, candidate: 2 });
    expect(JSON.stringify(students)).toBe(before); // students untouched
    expect(result.baselineEligibleCount).toBe(1); // only student 3
    expect(result.candidateEligibleCount).toBe(3); // students 1, 2, 3
    expect(result.delta).toBe(2);
    expect(result.newlyEligibleStudentIds.sort()).toEqual(["1", "2"]);
    expect(result.removedStudentIds).toEqual([]);
  });

  it("never affects a later evaluation against the baseline rule", () => {
    const before = summarizeCohort(students, baseline, 1);
    simulateEligibility(students, baseline, candidate, { baseline: 1, candidate: 2 });
    const after = summarizeCohort(students, baseline, 1);
    expect(after.eligibleCount).toBe(before.eligibleCount);
  });
});

describe("Cohort summary category totals", () => {
  it("sums primary failure categories to exactly the not-eligible total", () => {
    const rule = ruleFor(7.0, 0, ["CSE", "IT"]);
    const summary = summarizeCohort(students, rule, 1);
    const bucketSum = Object.values(summary.byPrimaryFailureCategory).reduce((a, b) => a + b, 0);
    expect(bucketSum).toBe(summary.notEligibleCount);
    expect(summary.eligibleCount + summary.notEligibleCount).toBe(summary.total);
  });
});
