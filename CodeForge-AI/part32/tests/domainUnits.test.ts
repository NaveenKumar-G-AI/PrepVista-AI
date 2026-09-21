import { describe, expect, it } from "vitest";
import { classifyGap } from "../src/domain/classification.js";
import { calculateSeverity } from "../src/domain/severity.js";
import { detectConsistency, detectTrend } from "../src/domain/statistics.js";
import { nextClosureState } from "../src/domain/closureStateMachine.js";
import { analyzeDependencies } from "../src/domain/dependencyGraph.js";
import { rankGapsForRole } from "../src/domain/priority.js";
import { DEFAULT_GAP_ENGINE_CONFIG } from "../src/domain/config.js";
import { ClosureState, GapStatus, GapTrend, MasteryLevel, RoleSkillImportance, Severity } from "../src/domain/types.js";
import { makeSkillInput } from "./fixtures.js";
import { computeSkillGap } from "../src/domain/gapEngine.js";

const cfg = DEFAULT_GAP_ENGINE_CONFIG;

describe("classifyGap", () => {
  it("returns UNASSESSED when there is no evidence, regardless of current level", () => {
    expect(
      classifyGap({
        current: null,
        target: MasteryLevel.COMPETENT,
        evidenceCount: 0,
        consistency: { status: "INSUFFICIENT_SAMPLE", sampleSize: 0 },
        blockedByPrerequisite: false,
        config: cfg,
      }),
    ).toBe(GapStatus.UNASSESSED);
  });

  it("never returns NO_GAP when current is below target, even with a large magnitude", () => {
    const status = classifyGap({
      current: MasteryLevel.EMERGING,
      target: MasteryLevel.STRONG,
      evidenceCount: 5,
      consistency: { status: "CONSISTENT", sampleSize: 5, mean: 40, stdDev: 3 },
      blockedByPrerequisite: false,
      config: cfg,
    });
    expect(status).toBe(GapStatus.BELOW_TARGET);
  });

  it("prefers DEPENDENCY_BLOCKED over BELOW_TARGET when a prerequisite is unresolved", () => {
    const status = classifyGap({
      current: MasteryLevel.EMERGING,
      target: MasteryLevel.COMPETENT,
      evidenceCount: 5,
      consistency: { status: "CONSISTENT", sampleSize: 5, mean: 40, stdDev: 3 },
      blockedByPrerequisite: true,
      config: cfg,
    });
    expect(status).toBe(GapStatus.DEPENDENCY_BLOCKED);
  });
});

describe("calculateSeverity", () => {
  it("ranks a CORE below-target gap above an OPTIONAL below-target gap with the same magnitude", () => {
    const core = calculateSeverity({
      gapStatus: GapStatus.BELOW_TARGET,
      gapMagnitude: 2,
      importance: RoleSkillImportance.CORE,
      isRootGap: false,
      dependencyImpactScore: 0,
      config: cfg,
    });
    const optional = calculateSeverity({
      gapStatus: GapStatus.BELOW_TARGET,
      gapMagnitude: 2,
      importance: RoleSkillImportance.OPTIONAL,
      isRootGap: false,
      dependencyImpactScore: 0,
      config: cfg,
    });
    expect([Severity.CRITICAL, Severity.HIGH]).toContain(core);
    expect([Severity.LOW, Severity.MEDIUM]).toContain(optional);
  });

  it("a root gap with downstream impact never scores lower than the same gap without dependency impact", () => {
    const base = calculateSeverity({
      gapStatus: GapStatus.BELOW_TARGET,
      gapMagnitude: 1,
      importance: RoleSkillImportance.SUPPORTING,
      isRootGap: false,
      dependencyImpactScore: 0,
      config: cfg,
    });
    const withImpact = calculateSeverity({
      gapStatus: GapStatus.BELOW_TARGET,
      gapMagnitude: 1,
      importance: RoleSkillImportance.SUPPORTING,
      isRootGap: true,
      dependencyImpactScore: 1,
      config: cfg,
    });
    const order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL];
    expect(order.indexOf(withImpact)).toBeGreaterThanOrEqual(order.indexOf(base));
  });
});

describe("detectConsistency / detectTrend", () => {
  it("refuses to call consistency from too small a sample", () => {
    const result = detectConsistency([90, 40], cfg);
    expect(result.status).toBe("INSUFFICIENT_SAMPLE");
  });

  it("flags tight, similar scores as CONSISTENT", () => {
    const result = detectConsistency([90, 88, 91, 93], cfg);
    expect(result.status).toBe("CONSISTENT");
  });

  it("flags wide swings as INCONSISTENT", () => {
    const result = detectConsistency([92, 42, 89, 38], cfg);
    expect(result.status).toBe("INCONSISTENT");
  });

  it("reports UNKNOWN trend without enough data points", () => {
    const trend = detectTrend([{ timestamp: "2026-01-01", score: 50 }], { status: "INSUFFICIENT_SAMPLE", sampleSize: 1 }, cfg);
    expect(trend).toBe(GapTrend.UNKNOWN);
  });
});

describe("nextClosureState", () => {
  it("moves OPEN -> CLOSED only when both the target is met and evidence conditions are satisfied", () => {
    const { state } = nextClosureState({
      previousState: ClosureState.OPEN,
      gapStatus: GapStatus.NO_GAP,
      meetsTarget: true,
      evidenceConditionsMet: true,
      gapMagnitude: 0,
      config: cfg,
    });
    expect(state).toBe(ClosureState.CLOSED);
  });

  it("never reports CLOSED for an UNASSESSED skill", () => {
    const { state } = nextClosureState({
      previousState: null,
      gapStatus: GapStatus.UNASSESSED,
      meetsTarget: false,
      evidenceConditionsMet: false,
      gapMagnitude: 3,
      config: cfg,
    });
    expect(state).toBe(ClosureState.UNASSESSED);
  });
});

describe("analyzeDependencies", () => {
  it("a skill with no prerequisites and no dependents is never a root gap", () => {
    const annotation = analyzeDependencies({
      skillId: "skill.isolated",
      dependencyEdges: [],
      gapStatusBySkill: new Map([["skill.isolated", GapStatus.BELOW_TARGET]]),
      importanceBySkill: new Map([["skill.isolated", RoleSkillImportance.CORE]]),
    });
    expect(annotation.isRootGap).toBe(false);
    expect(annotation.dependencyImpactScore).toBe(0);
  });
});

describe("rankGapsForRole", () => {
  it("assigns priorityRank in descending priorityScore order", () => {
    const a = computeSkillGap(makeSkillInput({ skillId: "a", currentMasteryLevel: MasteryLevel.EMERGING, requiredMastery: MasteryLevel.STRONG, evidenceRecords: [] }));
    const b = computeSkillGap(makeSkillInput({ skillId: "b", currentMasteryLevel: MasteryLevel.STRONG, requiredMastery: MasteryLevel.STRONG, evidenceRecords: [] }));
    const ranked = rankGapsForRole([b, a]);
    expect(ranked[0]!.priorityScore).toBeGreaterThanOrEqual(ranked[1]!.priorityScore);
    expect(ranked[0]!.priorityRank).toBe(1);
    expect(ranked[1]!.priorityRank).toBe(2);
  });
});
