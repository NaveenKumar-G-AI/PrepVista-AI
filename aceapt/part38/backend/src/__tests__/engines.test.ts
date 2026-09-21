import test from "node:test";
import assert from "node:assert/strict";
import { rankCapabilitiesByRelevance, pickStrongestEvidence } from "../services/relevanceEngine";
import { detectAllGaps } from "../services/gapEngine";
import { rankProjects } from "../services/projectRankingEngine";

test("ranks a validated, role-relevant capability above an unrelated one", () => {
  const capabilities = [
    { id: "c1", name: "Python", evidenceStrength: "validated" as const, evidenceSourceIds: ["a"] },
    { id: "c2", name: "Photoshop", evidenceStrength: "validated" as const, evidenceSourceIds: ["b"] },
  ];
  const requirements = [{ id: "r1", name: "Python", importance: "core" as const }];
  const ranked = rankCapabilitiesByRelevance(capabilities, requirements);
  assert.equal(ranked[0].capability.id, "c1");
  assert.equal(ranked.find((r) => r.capability.id === "c2")?.score, 0);
});

test("does not surface an unvalidated claim as strongest evidence", () => {
  const capabilities = [{ id: "c1", name: "Python", evidenceStrength: "insufficient" as const, evidenceSourceIds: [] }];
  const requirements = [{ id: "r1", name: "Python", importance: "core" as const }];
  const strongest = pickStrongestEvidence(rankCapabilitiesByRelevance(capabilities, requirements));
  assert.equal(strongest.length, 0);
});

test("flags a core requirement with no matching capability as a skill gap", () => {
  const requirements = [{ id: "r1", name: "Testing", importance: "core" as const }];
  const gaps = detectAllGaps({
    requirements,
    capabilities: [],
    rankedCapabilities: rankCapabilitiesByRelevance([], requirements),
    projects: [],
    stories: [],
    snapshot: {},
  });
  assert.ok(gaps.some((g) => g.type === "skill" && g.title.includes("Testing")));
});

test("flags materials that state different career directions as a consistency gap", () => {
  const gaps = detectAllGaps({
    requirements: [],
    capabilities: [],
    rankedCapabilities: [],
    projects: [],
    stories: [],
    snapshot: { resumeStatedFocus: "Machine Learning", portfolioStatedFocus: "Backend Development" },
  });
  assert.ok(gaps.some((g) => g.type === "consistency"));
});

test("does not rank a project that matches none of the role's requirements", () => {
  const projects = [
    {
      id: "p1",
      title: "Photo filter app",
      description: "",
      technologies: ["Swift", "CoreImage"],
      validated: true,
      recencyMonthsAgo: 1,
      evidenceSourceIds: [],
    },
  ];
  const requirements = [{ id: "r1", name: "Python", importance: "core" as const }];
  const { best } = rankProjects(projects, requirements);
  assert.equal(best, null);
});
