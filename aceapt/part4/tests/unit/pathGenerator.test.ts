import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generatePath, resolveToActionableSkill } from "../../src/domain/pathGenerator.js";
import { SkillGraph } from "../../src/domain/skillGraph.js";
import { emptyEvidence, type Skill, type SkillEvidenceRecord, type StudentContext } from "../../src/domain/types.js";

function skill(id: string, prerequisiteIds: string[] = []): Skill {
  return { id, name: id, category: "test", prerequisiteIds, baseRelevance: { PLACEMENT_PREP: 0.7 }, estimatedLearnMinutes: 20 };
}

function strongEvidence(studentId: string, skillId: string): SkillEvidenceRecord {
  return {
    ...emptyEvidence(studentId, skillId),
    foundation: { accuracy: 0.9, attempts: 8, avgResponseTimeMs: 20000, lastAssessedAt: new Date().toISOString() },
    application: { accuracy: 0.9, attempts: 8, avgResponseTimeMs: 20000, lastAssessedAt: new Date().toISOString() },
    verifiedAt: new Date().toISOString(),
  };
}

function baseInput(overrides: Partial<Parameters<typeof generatePath>[0]> = {}) {
  return {
    context: { studentId: "s1", goal: "PLACEMENT_PREP", availableMinutesPerSession: 30, deadline: null } as StudentContext,
    graph: new SkillGraph([skill("a")]),
    evidenceMap: new Map<string, SkillEvidenceRecord>(),
    priorVersion: null,
    priorInterventionsBySkill: new Map(),
    recentAttemptsBySkill: new Map(),
    events: [],
    nextVersionNumber: 1,
    now: new Date(),
    ...overrides,
  };
}

describe("resolveToActionableSkill — regression test for the multi-hop bug caught via the seeded demo", () => {
  test("walks a three-deep blocked chain all the way to the one actionable skill, not just one hop", () => {
    // a (no evidence) <- b (no evidence) <- c (no evidence) <- d (candidate)
    const graph = new SkillGraph([skill("a"), skill("b", ["a"]), skill("c", ["b"]), skill("d", ["c"])]);
    const evidenceMap = new Map<string, SkillEvidenceRecord>(); // nobody has any evidence
    const resolved = resolveToActionableSkill("d", graph, evidenceMap);
    assert.equal(resolved, "a", `expected the walk to reach the root "a", got "${resolved}"`);
  });

  test("stops at the first ready skill, not necessarily the root", () => {
    const graph = new SkillGraph([skill("a"), skill("b", ["a"]), skill("c", ["b"])]);
    const evidenceMap = new Map<string, SkillEvidenceRecord>([["a", strongEvidence("s1", "a")]]); // a is VERIFIED
    const resolved = resolveToActionableSkill("c", graph, evidenceMap);
    assert.equal(resolved, "b", "b is ready once a is verified, so the walk should stop at b, not continue to a");
  });

  test("a skill with no prerequisite at all resolves to itself", () => {
    const graph = new SkillGraph([skill("a")]);
    assert.equal(resolveToActionableSkill("a", graph, new Map()), "a");
  });
});

describe("generatePath", () => {
  test("Phase 59 edge case #1 — no evidence at all still produces a sane path (root skills as LEARN)", () => {
    const graph = new SkillGraph([skill("a"), skill("b", ["a"])]);
    const version = generatePath(baseInput({ graph, evidenceMap: new Map() }));
    assert.ok(version.nodes.length > 0);
    assert.equal(version.nodes[0].skillId, "a"); // b should have resolved back to a
    assert.equal(version.nodes[0].action.actionType, "LEARN");
  });

  test("Phase 59 edge case #3 — a student with everything verified produces an empty/near-empty path, never a fabricated one", () => {
    const graph = new SkillGraph([skill("a")]);
    const evidenceMap = new Map([["a", strongEvidence("s1", "a")]]);
    const version = generatePath(baseInput({ graph, evidenceMap }));
    assert.equal(version.nodes.length, 0);
  });

  test("Phase 59 edge case #8 — circular prerequisite does not hang or crash, and records a warning", () => {
    const graph = new SkillGraph([skill("a", ["b"]), skill("b", ["a"])]); // direct cycle
    assert.ok(graph.warnings.length >= 1, "cycle should be detected and recorded");
    const version = generatePath(baseInput({ graph, evidenceMap: new Map() }));
    assert.ok(Array.isArray(version.nodes)); // just needs to terminate and return something well-formed
  });

  test("two students with identical evidence but different deadlines get different tradeoff framing and filtering (core personalization claim)", () => {
    const highRelevance: Skill = { id: "b", name: "b", category: "test", prerequisiteIds: ["a"], baseRelevance: { PLACEMENT_PREP: 0.9 }, estimatedLearnMinutes: 20 };
    const lowRelevance: Skill = { id: "c", name: "c", category: "test", prerequisiteIds: [], baseRelevance: { PLACEMENT_PREP: 0.2 }, estimatedLearnMinutes: 20 };
    const graph = new SkillGraph([skill("a"), highRelevance, lowRelevance]);
    const evidenceMap = new Map([
      ["a", strongEvidence("s1", "a")],
      ["b", { ...emptyEvidence("s1", "b"), foundation: { accuracy: 0.6, attempts: 4, avgResponseTimeMs: null, lastAssessedAt: null } }],
      ["c", { ...emptyEvidence("s1", "c"), foundation: { accuracy: 0.6, attempts: 4, avgResponseTimeMs: null, lastAssessedAt: null } }],
    ]);
    const relaxed = generatePath(
      baseInput({ graph, evidenceMap, context: { studentId: "s1", goal: "PLACEMENT_PREP", availableMinutesPerSession: 30, deadline: null } })
    );
    const urgent = generatePath(
      baseInput({
        graph,
        evidenceMap,
        context: { studentId: "s1", goal: "PLACEMENT_PREP", availableMinutesPerSession: 30, deadline: new Date(Date.now() + 86_400_000).toISOString() },
      })
    );
    assert.equal(relaxed.tradeoffMessage, null);
    assert.ok(urgent.tradeoffMessage && urgent.tradeoffMessage.length > 0);
    assert.ok(relaxed.nodes.some((n) => n.skillId === "c"), "low-relevance skill should appear when there's no deadline pressure");
    assert.ok(!urgent.nodes.some((n) => n.skillId === "c"), "low-relevance skill should be filtered out under an urgent deadline");
  });

  test("path versioning: regenerating with unchanged evidence reports no meaningful change", () => {
    const graph = new SkillGraph([skill("a")]);
    const evidenceMap = new Map<string, SkillEvidenceRecord>();
    const v1 = generatePath(baseInput({ graph, evidenceMap, nextVersionNumber: 1 }));
    const v2 = generatePath(baseInput({ graph, evidenceMap, priorVersion: v1, nextVersionNumber: 2 }));
    assert.match(v2.reason, /no meaningful evidence change/i);
  });
});
