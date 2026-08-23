import assert from "node:assert/strict";
import type { TestCase } from "./testKit.js";
import { buildContainer } from "../src/container.js";
import {
  freshDb, seedStandardMetricDefinitions, INST, SEASON,
  insertStudent, insertApplication, insertOffer, insertJoining, placeStudent,
} from "./fixtures.js";
import { MetricDefinitionRepository } from "../src/repositories/metricDefinitionRepository.js";

export const tests: TestCase[] = [
  {
    name: "placement_rate: numerator/denominator match hand-counted records",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      // 5 seeking students total, 2 fully placed (verified joined).
      placeStudent(db); // placed #1
      placeStudent(db); // placed #2
      insertStudent(db); // seeking, not placed
      insertStudent(db); // seeking, not placed
      insertStudent(db); // seeking, not placed

      const result = services.metricService.compute(INST, "placement_rate", SEASON);
      assert.equal(result.denominator, 5);
      assert.equal(result.numerator, 2);
      assert.equal(result.value, 40);
      assert.equal(result.definitionVersion, 1);
      assert.ok(result.formulaDefinition.length > 0, "formula definition must be present on every computed metric");
    },
  },
  {
    name: "placement_rate excludes students not marked seeking_placement",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      placeStudent(db);
      insertStudent(db, { seeking: false }); // must not count in denominator

      const result = services.metricService.compute(INST, "placement_rate", SEASON);
      assert.equal(result.denominator, 1);
      assert.equal(result.numerator, 1);
      assert.equal(result.value, 100);
    },
  },
  {
    name: "median_ctc: odd-count median matches manual calculation",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      placeStudent(db, { ctcFixed: 5, ctcVariable: 0 });
      placeStudent(db, { ctcFixed: 7, ctcVariable: 0 });
      placeStudent(db, { ctcFixed: 9, ctcVariable: 0 });

      const result = services.metricService.compute(INST, "median_ctc", SEASON);
      assert.equal(result.value, 7);
      assert.equal(result.denominator, 3);
    },
  },
  {
    name: "median_ctc: even-count median averages the two middle values",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      placeStudent(db, { ctcFixed: 5, ctcVariable: 0 });
      placeStudent(db, { ctcFixed: 7, ctcVariable: 0 });
      placeStudent(db, { ctcFixed: 9, ctcVariable: 0 });
      placeStudent(db, { ctcFixed: 11, ctcVariable: 0 });

      const result = services.metricService.compute(INST, "median_ctc", SEASON);
      assert.equal(result.value, 8); // (7+9)/2
    },
  },
  {
    name: "average_ctc and highest_ctc match manual calculation, and CTC = fixed + variable",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      placeStudent(db, { ctcFixed: 5, ctcVariable: 1 }); // total 6
      placeStudent(db, { ctcFixed: 7, ctcVariable: 0 }); // total 7
      placeStudent(db, { ctcFixed: 9, ctcVariable: 2 }); // total 11

      const avg = services.metricService.compute(INST, "average_ctc", SEASON);
      const max = services.metricService.compute(INST, "highest_ctc", SEASON);
      assert.equal(avg.value, 8); // (6+7+11)/3
      assert.equal(max.value, 11);
    },
  },
  {
    name: "small-sample caution appears below threshold and not above it",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      placeStudent(db, { ctcFixed: 6 });
      placeStudent(db, { ctcFixed: 7 });
      const small = services.metricService.compute(INST, "median_ctc", SEASON);
      assert.ok(small.caution, "expected a small-sample caution with only 2 records");

      for (let i = 0; i < 3; i++) placeStudent(db, { ctcFixed: 8 });
      const larger = services.metricService.compute(INST, "median_ctc", SEASON);
      assert.equal(larger.denominator, 5);
      assert.equal(larger.caution, undefined, "5 records should clear the small-sample threshold");
    },
  },
  {
    name: "unregistered calculator_key throws a clear, actionable error",
    fn() {
      const db = freshDb();
      const defs = new MetricDefinitionRepository(db);
      defs.create({
        institutionId: INST, name: "made_up_metric", description: "x",
        formulaDefinition: "x", denominatorDefinition: "x", dataSources: [],
        calculatorKey: "does_not_exist", version: 1, effectiveFrom: "2099-01-01", effectiveTo: null, status: "active",
      });
      const { services } = buildContainer(db);
      assert.throws(
        () => services.metricService.compute(INST, "made_up_metric", SEASON),
        /not registered/
      );
    },
  },
  {
    name: "computing an undefined metric name throws instead of silently returning zero",
    fn() {
      const db = freshDb();
      const { services } = buildContainer(db);
      assert.throws(
        () => services.metricService.compute(INST, "never_defined", SEASON),
        /No active metric_definition/
      );
    },
  },
];
