import assert from "node:assert/strict";
import type { TestCase } from "./testKit.js";
import { buildContainer } from "../src/container.js";
import {
  freshDb, seedStandardMetricDefinitions, seedStandardReportDefinition, INST, SEASON,
  insertStudent, placeStudent,
} from "./fixtures.js";

export const tests: TestCase[] = [
  {
    name: "a published snapshot is frozen: later data changes do not alter it, but a NEW report reflects them",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      seedStandardReportDefinition(db);
      const { services, repos } = buildContainer(db);

      // T0: 5 seeking students, 2 placed -> 40%.
      placeStudent(db);
      placeStudent(db);
      insertStudent(db);
      insertStudent(db);
      insertStudent(db);

      const { snapshot: snap1, payload: payload1 } = services.reportGenerationService.publishExecutiveReport(
        INST, SEASON, "tpo:test_user"
      );
      assert.equal(payload1.kpis.placementRate.value, 40);
      assert.equal(payload1.kpis.placementRate.numerator, 2);
      assert.equal(payload1.kpis.placementRate.denominator, 5);

      // T1: data changes AFTER publication — one more student placed.
      placeStudent(db);
      const liveRateNow = services.metricService.compute(INST, "placement_rate", SEASON);
      assert.equal(liveRateNow.value, 50, "sanity check: the live/current number has indeed moved");

      // The EARLIER snapshot, reloaded from storage, must still show the OLD number.
      const reloaded = repos.snapshots.getById(snap1.id);
      assert.ok(reloaded, "snapshot must be retrievable by id");
      const reloadedPayload = reloaded!.payload as typeof payload1;
      assert.equal(reloadedPayload.kpis.placementRate.value, 40, "published snapshot must NOT drift with later data");
      assert.equal(reloadedPayload.kpis.placementRate.numerator, 2);
      assert.equal(reloadedPayload.kpis.placementRate.denominator, 5);

      // A freshly generated report, in contrast, reflects the new state.
      const { snapshot: snap2, payload: payload2 } = services.reportGenerationService.publishExecutiveReport(
        INST, SEASON, "tpo:test_user"
      );
      assert.equal(payload2.kpis.placementRate.value, 50);
      assert.equal(payload2.kpis.placementRate.numerator, 3);
      assert.equal(payload2.kpis.placementRate.denominator, 6);
      assert.notEqual(snap1.id, snap2.id, "each publish creates a distinct, independently retrievable snapshot");

      // And re-fetching the FIRST snapshot again (after the second publish) still shows 40%.
      const reloadedAgain = repos.snapshots.getById(snap1.id);
      assert.equal((reloadedAgain!.payload as typeof payload1).kpis.placementRate.value, 40);
    },
  },
  {
    name: "a snapshot records which metric_definition VERSION it used, and stays pinned to it after the definition is superseded",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      seedStandardReportDefinition(db);
      const { services, repos } = buildContainer(db);

      placeStudent(db);
      insertStudent(db);

      const { snapshot: snap1, payload: payload1 } = services.reportGenerationService.publishExecutiveReport(
        INST, SEASON, "tpo:test_user"
      );
      assert.equal(payload1.kpis.placementRate.definitionVersion, 1);
      assert.equal(snap1.metricDefinitionVersions.placement_rate, 1);

      // Institution revises its placement_rate definition to v2 and retires v1.
      const v1 = repos.metricDefinitions.getActive(INST, "placement_rate");
      repos.metricDefinitions.supersede(v1.id);
      repos.metricDefinitions.create({
        institutionId: INST, name: "placement_rate",
        description: "Revised definition",
        formulaDefinition: "v2: verified placed students (including off-campus) ÷ seeking students.",
        denominatorDefinition: v1.denominatorDefinition,
        dataSources: v1.dataSources, calculatorKey: "placement_rate",
        version: 2, effectiveFrom: "2099-06-01T00:00:00.000Z", effectiveTo: null, status: "active",
      });

      // A NEW report now resolves to v2.
      const { payload: payload2 } = services.reportGenerationService.publishExecutiveReport(INST, SEASON, "tpo:test_user");
      assert.equal(payload2.kpis.placementRate.definitionVersion, 2);
      assert.match(payload2.kpis.placementRate.formulaDefinition, /v2:/);

      // The ORIGINAL snapshot must still reference v1, unaffected by the institution's later revision.
      const reloaded = repos.snapshots.getById(snap1.id);
      assert.equal(reloaded!.metricDefinitionVersions.placement_rate, 1);
      assert.equal((reloaded!.payload as typeof payload1).kpis.placementRate.definitionVersion, 1);
    },
  },
  {
    name: "publishing attaches durable evidence for the headline metrics",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      seedStandardReportDefinition(db);
      const { services } = buildContainer(db);

      placeStudent(db);
      insertStudent(db);

      services.reportGenerationService.publishExecutiveReport(INST, SEASON, "tpo:test_user");

      const evidence = services.evidenceService.forEntity("metric_value", `placement_rate:${INST}:${SEASON}`);
      assert.ok(evidence.length >= 1, "publishing a report should leave durable evidence behind for its headline metric");
      assert.match(evidence[0].sourceReference, /definition=/);
      assert.match(evidence[0].sourceReference, /denominator=/);
    },
  },
  {
    name: "report warnings and quality score are captured INTO the snapshot at publish time",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      seedStandardReportDefinition(db);
      const { services } = buildContainer(db);

      placeStudent(db); // clean, verified

      const { snapshot } = services.reportGenerationService.publishExecutiveReport(INST, SEASON, "tpo:test_user");
      assert.ok(Array.isArray(snapshot.warnings));
      assert.ok(typeof snapshot.qualityScore === "number");
      assert.ok(snapshot.dataThrough.length > 0, "snapshot must record a data-through timestamp");
      assert.ok(snapshot.generatedAt.length > 0);
    },
  },
];
