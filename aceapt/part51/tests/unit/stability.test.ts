import { describe, it, expect } from "vitest";
import { computeStability } from "../../src/domain/stability.js";

describe("computeStability — §51 (mean accuracy alone isn't enough)", () => {
  it("labels a steady student as stable", () => {
    const studentA = computeStability([95, 94, 96, 95]);
    expect(studentA.consistency).toBe("stable");
  });

  it("labels a volatile student as highly variable even with a similar mean", () => {
    const studentB = computeStability([100, 70, 98, 75]);
    expect(studentB.consistency).toBe("highly_variable");
  });

  it("the two students' means land close together even though their consistency differs", () => {
    const studentA = computeStability([95, 94, 96, 95]);
    const studentB = computeStability([100, 70, 98, 75]);
    expect(Math.abs((studentA.mean ?? 0) - (studentB.mean ?? 0))).toBeLessThan(10);
    expect(studentA.consistency).not.toBe(studentB.consistency);
  });

  it("reports insufficient evidence below the minimum number of points", () => {
    const result = computeStability([95, 94]);
    expect(result.consistency).toBe("insufficient_evidence");
    expect(result.mean).toBeNull();
  });
});
