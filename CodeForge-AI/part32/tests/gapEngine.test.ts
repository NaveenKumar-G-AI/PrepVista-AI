import { describe, expect, it } from "vitest";
import { computeRoleGapProfile, computeSkillGap } from "../src/domain/gapEngine.js";
import {
  ClosureState,
  DifficultyLevel,
  GapStatus,
  GapTrend,
  MasteryLevel,
  RoleSkillImportance,
  Severity,
} from "../src/domain/types.js";
import { DEFAULT_GAP_ENGINE_CONFIG } from "../src/domain/config.js";
import { evidenceSeries, makeEvidence, makeSkillInput } from "./fixtures.js";

describe("Golden Case A - core skills meet target, optional skill below target", () => {
  it("does not let an optional gap block core readiness", () => {
    const python = makeSkillInput({
      skillId: "skill.python",
      skillName: "Python",
      importance: RoleSkillImportance.CORE,
      requiredMastery: MasteryLevel.STRONG,
      currentMasteryLevel: MasteryLevel.STRONG,
      evidenceRecords: [
        makeEvidence({ skillId: "skill.python", rawScore: 88, taskId: "t1" }),
        makeEvidence({ skillId: "skill.python", rawScore: 90, taskId: "t2" }),
        makeEvidence({ skillId: "skill.python", rawScore: 87, taskId: "t3" }),
      ],
    });
    const docker = makeSkillInput({
      skillId: "skill.docker",
      skillName: "Docker",
      importance: RoleSkillImportance.OPTIONAL,
      requiredMastery: MasteryLevel.DEVELOPING,
      currentMasteryLevel: MasteryLevel.EMERGING,
      evidenceRecords: [
        makeEvidence({ skillId: "skill.docker", rawScore: 50, taskId: "t1" }),
        makeEvidence({ skillId: "skill.docker", rawScore: 52, taskId: "t2" }),
        makeEvidence({ skillId: "skill.docker", rawScore: 48, taskId: "t3" }),
      ],
    });

    const profile = computeRoleGapProfile([python, docker], []);
    const pythonResult = profile.skills.find((s) => s.skillId === "skill.python")!;
    const dockerResult = profile.skills.find((s) => s.skillId === "skill.docker")!;

    expect(pythonResult.gapStatus).toBe(GapStatus.NO_GAP);
    expect(dockerResult.gapStatus).toBe(GapStatus.PARTIAL);
    expect(dockerResult.severity).toBe(Severity.LOW);
    expect(profile.coreSkillCoverage).toEqual({ total: 1, meetingTarget: 1 });
    expect(profile.criticalGaps.map((g) => g.skillId)).not.toContain("skill.docker");
  });
});

describe("Golden Case B - mandatory core skill below target", () => {
  it("surfaces a CORE gap as a high-impact, critical result", () => {
    const debugging = makeSkillInput({
      skillId: "skill.debugging",
      skillName: "Debugging",
      importance: RoleSkillImportance.CORE,
      requiredMastery: MasteryLevel.COMPETENT,
      currentMasteryLevel: MasteryLevel.EMERGING,
      evidenceRecords: [
        makeEvidence({ skillId: "skill.debugging", rawScore: 42, taskId: "t1" }),
        makeEvidence({ skillId: "skill.debugging", rawScore: 45, taskId: "t2" }),
        makeEvidence({ skillId: "skill.debugging", rawScore: 40, taskId: "t3" }),
      ],
    });

    const result = computeSkillGap(debugging);

    expect(result.gapStatus).toBe(GapStatus.BELOW_TARGET);
    expect(result.gapMagnitude).toBe(2);
    expect(result.severity).toBe(Severity.CRITICAL);
  });
});

describe("Golden Case C - no evidence", () => {
  it("reports UNASSESSED, never a numeric/weak score, and keeps it distinct from BELOW_TARGET", () => {
    const sql = makeSkillInput({
      skillId: "skill.sql",
      skillName: "SQL",
      importance: RoleSkillImportance.CORE,
      requiredMastery: MasteryLevel.COMPETENT,
      currentMasteryLevel: null,
      evidenceRecords: [],
    });

    const result = computeSkillGap(sql);

    expect(result.gapStatus).toBe(GapStatus.UNASSESSED);
    expect(result.gapStatus).not.toBe(GapStatus.BELOW_TARGET);
    expect(result.closureState).toBe(ClosureState.UNASSESSED);
    // Unassessed CORE skills still matter for role readiness (they earn a
    // meaningful severity) but are never conflated with a confirmed deficiency.
    expect(result.severity).toBe(Severity.HIGH);
    expect(result.severity).not.toBe(Severity.CRITICAL);
  });

  it("treats a skill with a cached mastery value but zero fresh evidence as UNASSESSED, not a false pass", () => {
    // Simulates the evidence service being unavailable (Phase 75) while a
    // stale mastery value happens to still be present - the engine should
    // not trust a level with nothing behind it in its own evidence view.
    const result = computeSkillGap(
      makeSkillInput({
        currentMasteryLevel: MasteryLevel.COMPETENT,
        evidenceRecords: [],
      }),
    );
    expect(result.gapStatus).toBe(GapStatus.UNASSESSED);
  });
});

describe("Golden Case D - improving skill, gap still present", () => {
  it("classifies trend as IMPROVING without hiding the remaining gap", () => {
    const apiDesign = makeSkillInput({
      skillId: "skill.api-design",
      skillName: "API Design",
      importance: RoleSkillImportance.IMPORTANT,
      requiredMastery: MasteryLevel.COMPETENT,
      currentMasteryLevel: MasteryLevel.DEVELOPING,
      evidenceRecords: evidenceSeries({
        skillId: "skill.api-design",
        scores: [40, 42, 45, 85, 88, 90],
        latestDaysAgo: 5,
      }),
    });

    const result = computeSkillGap(apiDesign);

    expect(result.trend).toBe(GapTrend.IMPROVING);
    expect(result.gapStatus).not.toBe(GapStatus.NO_GAP);
    expect(result.gapStatus).toBe(GapStatus.PARTIAL);
    expect(result.explanation.trendNote).toMatch(/improvement/i);
  });
});

describe("Golden Case E - root dependency gap", () => {
  it("flags the foundational skill as the root gap, not its downstream symptoms", () => {
    const consistentLow = (skillId: string) => [
      makeEvidence({ skillId, rawScore: 40, taskId: `${skillId}-1` }),
      makeEvidence({ skillId, rawScore: 43, taskId: `${skillId}-2` }),
      makeEvidence({ skillId, rawScore: 38, taskId: `${skillId}-3` }),
    ];

    const fundamentals = makeSkillInput({
      skillId: "skill.programming-fundamentals",
      skillName: "Programming Fundamentals",
      requiredMastery: MasteryLevel.COMPETENT,
      currentMasteryLevel: MasteryLevel.EMERGING,
      evidenceRecords: consistentLow("skill.programming-fundamentals"),
    });
    const dataStructures = makeSkillInput({
      skillId: "skill.data-structures",
      skillName: "Data Structures",
      requiredMastery: MasteryLevel.COMPETENT,
      currentMasteryLevel: MasteryLevel.EMERGING,
      evidenceRecords: consistentLow("skill.data-structures"),
    });
    const algorithms = makeSkillInput({
      skillId: "skill.algorithms",
      skillName: "Algorithms",
      requiredMastery: MasteryLevel.COMPETENT,
      currentMasteryLevel: MasteryLevel.EMERGING,
      evidenceRecords: consistentLow("skill.algorithms"),
    });

    const profile = computeRoleGapProfile(
      [fundamentals, dataStructures, algorithms],
      [
        { skillId: "skill.data-structures", prerequisiteSkillId: "skill.programming-fundamentals" },
        { skillId: "skill.algorithms", prerequisiteSkillId: "skill.data-structures" },
      ],
    );

    const fundamentalsResult = profile.skills.find((s) => s.skillId === "skill.programming-fundamentals")!;
    const dataStructuresResult = profile.skills.find((s) => s.skillId === "skill.data-structures")!;
    const algorithmsResult = profile.skills.find((s) => s.skillId === "skill.algorithms")!;

    expect(fundamentalsResult.dependency.isRootGap).toBe(true);
    expect(dataStructuresResult.dependency.isRootGap).toBe(false);
    expect(algorithmsResult.dependency.isRootGap).toBe(false);
    expect(dataStructuresResult.gapStatus).toBe(GapStatus.DEPENDENCY_BLOCKED);
    expect(algorithmsResult.gapStatus).toBe(GapStatus.DEPENDENCY_BLOCKED);
    expect(profile.rootGaps.map((g) => g.skillId)).toEqual(["skill.programming-fundamentals"]);
  });
});

describe("Edge cases (Phase 66)", () => {
  it("one evidence record is INSUFFICIENT_EVIDENCE, not a confident classification", () => {
    const result = computeSkillGap(
      makeSkillInput({
        currentMasteryLevel: MasteryLevel.DEVELOPING,
        evidenceRecords: [makeEvidence({ rawScore: 60 })],
      }),
    );
    expect(result.gapStatus).toBe(GapStatus.INSUFFICIENT_EVIDENCE);
  });

  it("recent oscillating evidence is INCONSISTENT, not averaged into a confident status", () => {
    const result = computeSkillGap(
      makeSkillInput({
        currentMasteryLevel: MasteryLevel.DEVELOPING,
        evidenceRecords: [
          makeEvidence({ rawScore: 92, taskId: "a" }),
          makeEvidence({ rawScore: 42, taskId: "b" }),
          makeEvidence({ rawScore: 89, taskId: "c" }),
        ],
      }),
    );
    expect(result.gapStatus).toBe(GapStatus.INCONSISTENT);
    expect(result.consistency.status).toBe("INCONSISTENT");
  });

  it("meeting the target does not auto-certify closure without sufficient evidence conditions", () => {
    const result = computeSkillGap(
      makeSkillInput({
        requiredMastery: MasteryLevel.COMPETENT,
        currentMasteryLevel: MasteryLevel.COMPETENT,
        evidenceRecords: [
          makeEvidence({ rawScore: 91, taskId: "same-task" }),
          makeEvidence({ rawScore: 93, taskId: "same-task" }), // no diversity
        ],
        previousClosureState: null,
      }),
    );
    expect(result.gapStatus).toBe(GapStatus.NO_GAP);
    expect(result.closureState).not.toBe(ClosureState.CLOSED);
    expect(result.closureState).toBe(ClosureState.NEARLY_CLOSED);
  });

  it("regression after a previously CLOSED gap reopens it rather than silently updating", () => {
    const result = computeSkillGap(
      makeSkillInput({
        requiredMastery: MasteryLevel.COMPETENT,
        currentMasteryLevel: MasteryLevel.DEVELOPING,
        evidenceRecords: [
          makeEvidence({ rawScore: 55, taskId: "a" }),
          makeEvidence({ rawScore: 58, taskId: "b" }),
          makeEvidence({ rawScore: 52, taskId: "c" }),
        ],
        previousClosureState: ClosureState.CLOSED,
      }),
    );
    expect(result.closureState).toBe(ClosureState.REOPENED);
    expect(result.closureReason).toMatch(/no longer meets/i);
  });

  it("the same skill and same evidence yield different gaps under different role requirements (Phase 41)", () => {
    const evidence = [
      makeEvidence({ skillId: "skill.sql", rawScore: 45, taskId: "a" }),
      makeEvidence({ skillId: "skill.sql", rawScore: 48, taskId: "b" }),
      makeEvidence({ skillId: "skill.sql", rawScore: 44, taskId: "c" }),
    ];

    const backendResult = computeSkillGap(
      makeSkillInput({
        roleId: "role.backend-developer",
        skillId: "skill.sql",
        importance: RoleSkillImportance.CORE,
        requiredMastery: MasteryLevel.COMPETENT,
        currentMasteryLevel: MasteryLevel.EMERGING,
        evidenceRecords: evidence,
      }),
    );
    const frontendResult = computeSkillGap(
      makeSkillInput({
        roleId: "role.frontend-developer",
        skillId: "skill.sql",
        importance: RoleSkillImportance.OPTIONAL,
        requiredMastery: MasteryLevel.DEVELOPING,
        currentMasteryLevel: MasteryLevel.EMERGING,
        evidenceRecords: evidence,
      }),
    );

    expect(backendResult.severity).toBe(Severity.CRITICAL);
    expect(frontendResult.severity).toBe(Severity.LOW);
    expect(backendResult.gapStatus).toBe(GapStatus.BELOW_TARGET);
    expect(frontendResult.gapStatus).toBe(GapStatus.PARTIAL);
  });

  it("evidence below the role's required difficulty reduces confidence coverage (Phase 17)", () => {
    const result = computeSkillGap(
      makeSkillInput({
        requiredDifficulty: DifficultyLevel.ADVANCED,
        currentMasteryLevel: MasteryLevel.COMPETENT,
        evidenceRecords: [
          makeEvidence({ rawScore: 80, taskId: "a", difficulty: DifficultyLevel.BEGINNER }),
          makeEvidence({ rawScore: 82, taskId: "b", difficulty: DifficultyLevel.INTERMEDIATE }),
          makeEvidence({ rawScore: 79, taskId: "c", difficulty: DifficultyLevel.INTERMEDIATE }),
        ],
      }),
    );
    expect(result.confidenceFactors.coverage).toBeCloseTo(0.4);
  });

  it("uses the injected config rather than hardcoded thresholds", () => {
    const strictConfig = { ...DEFAULT_GAP_ENGINE_CONFIG, partialGapThreshold: 0 };
    const result = computeSkillGap(
      makeSkillInput({
        requiredMastery: MasteryLevel.DEVELOPING,
        currentMasteryLevel: MasteryLevel.EMERGING, // magnitude 1
        evidenceRecords: [
          makeEvidence({ rawScore: 60, taskId: "a" }),
          makeEvidence({ rawScore: 62, taskId: "b" }),
        ],
      }),
      strictConfig,
    );
    // With partialGapThreshold=0, a magnitude-1 gap can no longer be PARTIAL.
    expect(result.gapStatus).toBe(GapStatus.BELOW_TARGET);
  });
});
