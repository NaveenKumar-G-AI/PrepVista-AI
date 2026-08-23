import { describe, expect, it } from "vitest";
import { db } from "../src/db/client";
import { skillMeasurement } from "../src/db/schema";
import { newId } from "../src/lib/id";
import { calculateReadiness, getReadinessChange, getReadinessTrend } from "../src/services/readinessService";
import { makeInstitution, makeSeason, makeSkill, makeStudent } from "./helpers/factories";

async function setup() {
  const inst = await makeInstitution();
  const seasonRow = await makeSeason(inst.id);
  const stu = await makeStudent(inst.id, seasonRow.id);
  return { inst, seasonRow, stu };
}

async function addMeasurement(studentId: string, skillId: string, score: number) {
  await db.insert(skillMeasurement).values({
    id: newId("sm"),
    studentId,
    skillId,
    score,
    evidenceType: "ASSESSMENT",
  });
}

describe("readinessService", () => {
  it("returns null overall score and UNKNOWN risk — never 0 — when there is no evidence yet", async () => {
    const { inst, seasonRow, stu } = await setup();
    const snap = await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });
    expect(snap.overallScore).toBeNull();
    expect(snap.riskLevel).toBe("UNKNOWN");
    expect(snap.momentum).toBe("INSUFFICIENT_DATA");
    expect(snap.categoryScores).toEqual({});
  });

  it("aggregates skill measurements into category scores and an overall score", async () => {
    const { inst, seasonRow, stu } = await setup();
    const techSkill = await makeSkill(inst.id, "DSA", "technical");
    const commSkill = await makeSkill(inst.id, "Speaking", "communication");
    await addMeasurement(stu.id, techSkill.id, 80);
    await addMeasurement(stu.id, commSkill.id, 60);

    const snap = await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });
    expect(snap.categoryScores.technical).toEqual({ score: 80, evidenceCount: 1 });
    expect(snap.categoryScores.communication).toEqual({ score: 60, evidenceCount: 1 });
    expect(snap.overallScore).toBe(70); // average of the two category scores
    expect(snap.riskLevel).toBe("LOW"); // 70 is not < the MEDIUM_BELOW(70) threshold, so it's LOW
  });

  it("only counts the LATEST measurement per skill, not an average of all history", async () => {
    const { inst, seasonRow, stu } = await setup();
    const techSkill = await makeSkill(inst.id, "DSA", "technical");
    await addMeasurement(stu.id, techSkill.id, 40);
    await new Promise((r) => setTimeout(r, 5));
    await addMeasurement(stu.id, techSkill.id, 90);

    const snap = await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });
    expect(snap.categoryScores.technical?.score).toBe(90);
  });

  it("computes momentum by comparing to the previous snapshot, and needs 2 snapshots minimum", async () => {
    const { inst, seasonRow, stu } = await setup();
    const techSkill = await makeSkill(inst.id, "DSA", "technical");

    await addMeasurement(stu.id, techSkill.id, 50);
    const first = await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });
    expect(first.momentum).toBe("INSUFFICIENT_DATA");

    await addMeasurement(stu.id, techSkill.id, 65); // +15, above the momentum threshold
    const second = await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });
    expect(second.momentum).toBe("RISING");

    const change = await getReadinessChange(stu.id);
    expect(change.hasEnoughData).toBe(true);
    expect(change.change).toBe(15);
  });

  it("getReadinessChange reports hasEnoughData:false rather than a fabricated 0 with only one snapshot", async () => {
    const { inst, seasonRow, stu } = await setup();
    const techSkill = await makeSkill(inst.id, "DSA", "technical");
    await addMeasurement(stu.id, techSkill.id, 50);
    await calculateReadiness({ studentId: stu.id, institutionId: inst.id, seasonId: seasonRow.id });

    const change = await getReadinessChange(stu.id);
    expect(change.hasEnoughData).toBe(false);
    expect(change.change).toBeNull();
  });

  it("readiness trend returns hasData:false for a student with no snapshots at all", async () => {
    const { stu } = await setup();
    const trend = await getReadinessTrend(stu.id);
    expect(trend.hasData).toBe(false);
  });
});
