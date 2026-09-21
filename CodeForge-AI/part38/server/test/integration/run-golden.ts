/**
 * Golden integration tests (brief §76-81), run as a plain script via
 * `tsx` rather than through vitest.
 *
 * Why not vitest: these tests exercise the real SQLite-backed pipeline
 * end-to-end, which means importing src/db/database.ts, which imports
 * node:sqlite. The installed Vite/vite-node version (pulled in by
 * vitest@2.1.9) doesn't yet recognize node:sqlite as a Node builtin during
 * its module-graph transform (node:sqlite is new enough — added Node
 * 22.5 — that it has no legacy bare-name alias, and this Vite version's
 * builtin-stripping logic appears to assume every "node:x" does). Neither
 * `test.server.deps.external` nor Vite's `ssr.external` worked around it
 * (both are still set in vitest.config.ts in case a Vite patch fixes it).
 * tsx has no such layer — it transpiles TS with esbuild and hands off to
 * Node's own `require`/`import`, so `node:sqlite` resolves the normal way.
 *
 * The pure-logic suites (state machine, guardrail, access-control) stay in
 * vitest under test/unit — they don't touch the database.
 */
import assert from "node:assert/strict";
import path from "node:path";

process.env.SQLITE_FILE_PATH = path.join(__dirname, "..", "..", "data", "test-golden.sqlite");

import { resetDbForTests } from "../../src/db/database";
import { migrate } from "../../src/db/migrate";
import { bumpDataVersion, DEMO, seedFixtureData } from "../../src/db/seed-data";
import { buildFixtureIntelligencePorts } from "../../src/adapters/fixture-adapters";
import { DEMO_USERS } from "../../src/testing/test-tokens";
import { MasteryLevel, ReportFreshnessStatus, ReportLifecycleStatus } from "../../src/domain/enums";
import { ReportAccessDeniedError } from "../../src/services/access-control";
import { getReportById } from "../../src/services/report-repository";
import { getReportForViewing, processReportGeneration, requestReport } from "../../src/services/report-generation-service";
import { drainQueue } from "../../src/jobs/queue";
import type { CodeForgeIntelligencePorts } from "../../src/ports";

const ports = buildFixtureIntelligencePorts();
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    // eslint-disable-next-line no-console
    console.log(`  \u2717 ${name}`);
    // eslint-disable-next-line no-console
    console.log(`    ${(err as Error).message}`);
  }
}

async function assertRejectsWith(promise: Promise<unknown>, ctor: new (...args: never[]) => Error): Promise<void> {
  try {
    await promise;
  } catch (err) {
    assert.ok(
      err instanceof ctor,
      `expected error to be instance of ${ctor.name}, got ${(err as Error)?.constructor?.name}`,
    );
    return;
  }
  throw new Error("expected promise to reject, but it resolved");
}

async function main() {
  resetDbForTests();
  migrate();
  seedFixtureData();

  // eslint-disable-next-line no-console
  console.log("Golden student test (brief §76)");
  await test("reflects exactly the authoritative mastery levels — never alters them", async () => {
    const { report } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);
    await drainQueue(ports);
    const fetched = getReportById(report.id);
    assert.equal(fetched?.status, ReportLifecycleStatus.COMPLETED);
    const dto = fetched!.dto!;
    const levelOf = (name: string) => dto.skills.find((s) => s.skillName === name)?.masteryLevel;
    assert.equal(levelOf("Python"), MasteryLevel.PROFICIENT);
    assert.equal(levelOf("SQL"), MasteryLevel.DEVELOPING);
    assert.equal(levelOf("Backend Engineering"), MasteryLevel.COMPETENT);
    assert.equal(levelOf("System Design"), MasteryLevel.FOUNDATIONAL);
  });

  // eslint-disable-next-line no-console
  console.log("Golden limited-data test (brief §77)");
  await test("stays useful without inventing missing evidence", async () => {
    const { report } = await requestReport(ports, DEMO_USERS.studentSparse, DEMO.studentSparse);
    await drainQueue(ports);
    const fetched = getReportById(report.id);
    assert.equal(fetched?.status, ReportLifecycleStatus.COMPLETED);
    const dto = fetched!.dto!;
    assert.notEqual(dto.evidence.coding, null);
    assert.equal(dto.evidence.projects.length, 0);
    assert.equal(dto.evidence.interviews.length, 0);
    assert.equal(dto.growth.insufficientData, true);
    const narrativeText = `${dto.narrative.executiveSummary} ${dto.narrative.strengthsNarrative} ${dto.narrative.weaknessesNarrative} ${dto.narrative.growthNarrative}`;
    assert.doesNotMatch(narrativeText.toLowerCase(), /built (a|an|the) production|passed (the|a|an) (technical )?interview/);
  });

  // eslint-disable-next-line no-console
  console.log("Golden security test (brief §79, tenant isolation §47)");
  await test("denies cross-student, cross-org, and platform-admin access with no metadata leakage", async () => {
    const { report: goldenReport } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);
    await drainQueue(ports);

    await assertRejectsWith(getReportForViewing(ports, DEMO_USERS.studentSparse, goldenReport.id), ReportAccessDeniedError);
    await assertRejectsWith(getReportForViewing(ports, DEMO_USERS.studentOther, goldenReport.id), ReportAccessDeniedError);
    await assertRejectsWith(getReportForViewing(ports, DEMO_USERS.admin1, goldenReport.id), ReportAccessDeniedError);
    await assertRejectsWith(getReportForViewing(ports, DEMO_USERS.studentGolden, "not-a-real-id"), ReportAccessDeniedError);

    const own = await getReportForViewing(ports, DEMO_USERS.studentGolden, goldenReport.id);
    assert.notEqual(own.dto, null);
    const asAssignedTrainer = await getReportForViewing(ports, DEMO_USERS.trainer1, goldenReport.id);
    assert.notEqual(asAssignedTrainer.dto, null);
  });

  // eslint-disable-next-line no-console
  console.log("Golden stale-report test (brief §80, §42-43)");
  await test("marks an existing report STALE after source data changes, without mutating its snapshot", async () => {
    const { report: originalReport } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);
    await drainQueue(ports);
    const originalVersion = originalReport.sourceDataVersion;

    const beforeBump = await getReportForViewing(ports, DEMO_USERS.studentGolden, originalReport.id);
    assert.equal(beforeBump.freshness, ReportFreshnessStatus.UP_TO_DATE);

    bumpDataVersion(DEMO.studentGolden);

    const afterBump = await getReportForViewing(ports, DEMO_USERS.studentGolden, originalReport.id);
    assert.equal(afterBump.freshness, ReportFreshnessStatus.STALE);
    assert.equal(afterBump.dto?.metadata.sourceDataVersion, originalVersion);
    assert.equal(afterBump.dto?.skills.find((s) => s.skillName === "SQL")?.masteryLevel, MasteryLevel.DEVELOPING);

    const { report: newReport, reused } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);
    assert.equal(reused, false);
    await drainQueue(ports);
    const freshView = await getReportForViewing(ports, DEMO_USERS.studentGolden, newReport.id);
    assert.equal(freshView.freshness, ReportFreshnessStatus.UP_TO_DATE);
    assert.equal(freshView.dto?.metadata.sourceDataVersion, originalVersion + 1);

    const stillThere = await getReportForViewing(ports, DEMO_USERS.studentGolden, originalReport.id);
    assert.equal(stillThere.freshness, ReportFreshnessStatus.STALE);
  });

  // eslint-disable-next-line no-console
  console.log("Golden generation-lifecycle test (brief §81, §63)");
  await test("goes REQUESTED -> QUEUED -> ... -> COMPLETED on success", async () => {
    bumpDataVersion(DEMO.studentGolden);
    const { report, reused } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);
    assert.equal(reused, false);
    assert.equal(report.status, ReportLifecycleStatus.QUEUED);
    assert.equal(report.dto, null);

    await processReportGeneration(ports, report.id);

    const completed = getReportById(report.id);
    assert.equal(completed?.status, ReportLifecycleStatus.COMPLETED);
    assert.notEqual(completed?.dto, null);
    assert.notEqual(completed?.generatedAt, null);
  });

  await test("lands safely in FAILED — with a reason, no corrupted/partial artifact exposed — when a dependency throws", async () => {
    bumpDataVersion(DEMO.studentGolden);
    const { report } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);

    const brokenPorts: CodeForgeIntelligencePorts = {
      ...ports,
      mastery: {
        getOverallMastery: async () => {
          throw new Error("Simulated Mastery Level System outage");
        },
        getSkillMasteryMap: async () => {
          throw new Error("Simulated Mastery Level System outage");
        },
      },
    };

    let threw = false;
    try {
      await processReportGeneration(brokenPorts, report.id);
    } catch (err) {
      threw = true;
      assert.match((err as Error).message, /Simulated Mastery Level System outage/);
    }
    assert.equal(threw, true, "expected processReportGeneration to throw");

    const failedRow = getReportById(report.id);
    assert.equal(failedRow?.status, ReportLifecycleStatus.FAILED);
    assert.match(failedRow?.failureReason ?? "", /Simulated Mastery Level System outage/);
    assert.equal(failedRow?.dto, null);
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
