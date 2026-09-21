import test from "node:test";
import assert from "node:assert/strict";
import { computePositioningProfile } from "../services/positioningEngine";
import { TemplateNarrativeAdapter } from "../ai/narrativePort";
import { PositioningDataSource } from "../types/integrationPorts";

const fakeDataSource: PositioningDataSource = {
  async getCapabilities() {
    return [{ id: "c1", name: "Python", evidenceStrength: "validated", evidenceSourceIds: ["a"] }];
  },
  async getProjects() {
    return [
      {
        id: "p1",
        title: "Order API",
        description: "",
        technologies: ["Python"],
        validated: true,
        recencyMonthsAgo: 1,
        evidenceSourceIds: ["a"],
      },
    ];
  },
  async getStories() {
    return [];
  },
  async getProfileMaterialsSnapshot() {
    return {};
  },
  async getRoleById(id: string) {
    if (id !== "role-backend") return null;
    return { id, name: "Backend Developer", requirements: [{ id: "r1", name: "Python", importance: "core" }] };
  },
  async getTargetRole() {
    return null;
  },
  async getOpportunity() {
    return null;
  },
};

test("builds a positioning profile end-to-end from real-shaped evidence", async () => {
  const profile = await computePositioningProfile({
    studentId: "s1",
    roleId: "role-backend",
    dataSource: fakeDataSource,
    narrativePort: new TemplateNarrativeAdapter(),
  });

  assert.equal(profile.strongestEvidence.length, 1);
  assert.equal(profile.bestProject?.project.id, "p1");
  assert.equal(profile.narrativeSource, "template-fallback");
  assert.equal(profile.version, 1);
});

test("throws a clear, typed error for an unknown role instead of guessing", async () => {
  await assert.rejects(
    computePositioningProfile({
      studentId: "s1",
      roleId: "does-not-exist",
      dataSource: fakeDataSource,
      narrativePort: new TemplateNarrativeAdapter(),
    }),
    /was not found/
  );
});
