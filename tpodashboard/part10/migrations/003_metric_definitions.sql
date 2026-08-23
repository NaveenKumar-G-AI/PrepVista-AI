-- Every metric an institution reports on is a versioned, named definition.
-- Reports never compute a number "inline" — they resolve a metric_definition
-- (by name, at a point in time) and record which version they used.
--
-- formula_definition / denominator_definition are human-readable text shown
-- verbatim on reports and dashboards (section 3: "the metric definition must
-- be visible"). calculator_key maps to a registered, testable function in
-- MetricService — see src/services/metricService.ts for why a formula
-- string is NOT parsed/executed dynamically.

CREATE TABLE metric_definitions (
  id                       TEXT PRIMARY KEY,
  institution_id           TEXT NOT NULL,
  name                     TEXT NOT NULL,   -- e.g. 'placement_rate'
  description              TEXT NOT NULL,
  formula_definition       TEXT NOT NULL,
  denominator_definition   TEXT NOT NULL,
  data_sources             TEXT NOT NULL,   -- JSON array, e.g. ["students","offers","joining"]
  calculator_key           TEXT NOT NULL,   -- registered function name in MetricService
  version                  INTEGER NOT NULL,
  effective_from           TEXT NOT NULL,
  effective_to             TEXT,
  status                   TEXT NOT NULL DEFAULT 'active' -- active | superseded | retired
);

CREATE UNIQUE INDEX idx_metric_def_name_version ON metric_definitions(institution_id, name, version);
