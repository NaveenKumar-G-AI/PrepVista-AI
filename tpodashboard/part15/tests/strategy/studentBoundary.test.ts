import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { ForecastPerformanceService } from "../../services/forecast/ForecastPerformanceService.js";
import { createForecastingTools } from "../../modules/forecasting/ai-tools.js";
import { createStrategyTools } from "../../modules/strategy/ai-tools.js";
import { AuthorizationError } from "../../rbac/access-control.js";
import { DATA_CUTOFF } from "../../repository/demo/seed.js";
import type { CallerContext } from "../../types/placement-strategy.types.js";

const PERSONAL_OUTLOOK_WHITELIST = ["readinessTrend", "readinessScore", "eligibleActiveOpportunities", "recommendedTraining", "message"];

async function getAnyStudentId(repo: DemoPlacementDataRepository): Promise<string> {
  const students = await repo.getStudents(DATA_CUTOFF);
  const candidate = students.find((s) => s.status !== "PLACED");
  assert.ok(candidate, "fixture sanity: demo data must contain at least one unplaced student");
  return candidate!.id;
}

test("every institutional tool rejects a STUDENT caller — no institutional data leaks to students", async () => {
  const repo = new DemoPlacementDataRepository();
  const performance = new ForecastPerformanceService();
  const studentId = await getAnyStudentId(repo);
  const student: CallerContext = { role: "STUDENT", userId: "u-student-1", institutionId: repo.getInstitutionId(), studentId };

  const tools = [...createForecastingTools(repo, performance), ...createStrategyTools(repo)];
  const institutionalTools = tools.filter((t) => t.name !== "get_personal_outlook");
  assert.ok(institutionalTools.length >= 10, "sanity: most tools in this build are institutional-only");

  for (const tool of institutionalTools) {
    await assert.rejects(
      () => tool.handler({ asOf: DATA_CUTOFF, departmentId: "CSE", topN: 5 } as any, student),
      (err: unknown) => err instanceof AuthorizationError,
      `${tool.name} must reject a STUDENT caller with AuthorizationError`
    );
  }
});

test("get_personal_outlook returns ONLY whitelisted personal fields for the student's own id", async () => {
  const repo = new DemoPlacementDataRepository();
  const performance = new ForecastPerformanceService();
  const studentId = await getAnyStudentId(repo);
  const student: CallerContext = { role: "STUDENT", userId: "u-student-1", institutionId: repo.getInstitutionId(), studentId };

  const tools = createStrategyTools(repo);
  const personalOutlookTool = tools.find((t) => t.name === "get_personal_outlook")!;
  const result = await personalOutlookTool.handler({ studentId, asOf: DATA_CUTOFF }, student);

  const keys = Object.keys(result as object);
  for (const key of keys) {
    assert.ok(PERSONAL_OUTLOOK_WHITELIST.includes(key), `get_personal_outlook returned non-whitelisted field '${key}'`);
  }
  // And explicitly confirm none of the forbidden institutional fields ever appear.
  const forbidden = ["departmentForecast", "institutionForecast", "companyPriority", "targetGap", "gapPoints", "recommendations"];
  for (const f of forbidden) {
    assert.equal(f in (result as object), false);
  }
  void performance; // constructed for symmetry with the tool factory signature; unused here
});

test("a student cannot fetch ANOTHER student's personal outlook", async () => {
  const repo = new DemoPlacementDataRepository();
  const students = await repo.getStudents(DATA_CUTOFF);
  const [me, someoneElse] = students.filter((s) => s.status !== "PLACED");
  assert.ok(me && someoneElse && me.id !== someoneElse.id, "fixture sanity: need two distinct unplaced students");

  const caller: CallerContext = { role: "STUDENT", userId: "u-student-1", institutionId: repo.getInstitutionId(), studentId: me!.id };
  const tools = createStrategyTools(repo);
  const personalOutlookTool = tools.find((t) => t.name === "get_personal_outlook")!;

  await assert.rejects(
    () => personalOutlookTool.handler({ studentId: someoneElse!.id, asOf: DATA_CUTOFF }, caller),
    (err: unknown) => err instanceof AuthorizationError
  );
});

test("TPO and MANAGEMENT callers ARE permitted through institutional tools", async () => {
  const repo = new DemoPlacementDataRepository();
  const performance = new ForecastPerformanceService();
  const tpo: CallerContext = { role: "TPO", userId: "u-tpo-1", institutionId: repo.getInstitutionId() };
  const management: CallerContext = { role: "MANAGEMENT", userId: "u-mgmt-1", institutionId: repo.getInstitutionId() };

  const tools = createForecastingTools(repo, performance);
  const placementForecastTool = tools.find((t) => t.name === "get_placement_forecast")!;

  const asTpo = await placementForecastTool.handler({ asOf: DATA_CUTOFF }, tpo);
  const asManagement = await placementForecastTool.handler({ asOf: DATA_CUTOFF }, management);
  assert.equal((asTpo as any).dataAvailable, true);
  assert.equal((asManagement as any).dataAvailable, true);
});
