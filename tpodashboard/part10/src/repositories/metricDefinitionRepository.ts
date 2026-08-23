import Database from "better-sqlite3";
import type { MetricDefinition } from "../types.js";

function toDefinition(row: any): MetricDefinition {
  return {
    id: row.id,
    institutionId: row.institution_id,
    name: row.name,
    description: row.description,
    formulaDefinition: row.formula_definition,
    denominatorDefinition: row.denominator_definition,
    dataSources: JSON.parse(row.data_sources),
    calculatorKey: row.calculator_key,
    version: row.version,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    status: row.status,
  };
}

export class MetricDefinitionRepository {
  constructor(private db: Database.Database) {}

  /** The single active version an institution is currently using for this metric name. */
  getActive(institutionId: string, name: string): MetricDefinition {
    const row = this.db
      .prepare(
        `SELECT * FROM metric_definitions
         WHERE institution_id = ? AND name = ? AND status = 'active'
         ORDER BY version DESC LIMIT 1`
      )
      .get(institutionId, name);
    if (!row) {
      throw new Error(
        `No active metric_definition found for "${name}" (institution ${institutionId}). ` +
          `Metrics must be defined before they can be reported — see PART10_INTEGRATION.md.`
      );
    }
    return toDefinition(row);
  }

  getByIdAndVersion(id: string, version: number): MetricDefinition | null {
    const row = this.db
      .prepare(
        "SELECT * FROM metric_definitions WHERE id = ? AND version = ?"
      )
      .get(id, version);
    return row ? toDefinition(row) : null;
  }

  listActive(institutionId: string): MetricDefinition[] {
    return this.db
      .prepare(
        "SELECT * FROM metric_definitions WHERE institution_id = ? AND status = 'active' ORDER BY name"
      )
      .all(institutionId)
      .map(toDefinition);
  }

  supersede(id: string): void {
    this.db.prepare("UPDATE metric_definitions SET status = 'superseded' WHERE id = ?").run(id);
  }

  create(def: Omit<MetricDefinition, "id">): MetricDefinition {
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO metric_definitions
         (id, institution_id, name, description, formula_definition, denominator_definition,
          data_sources, calculator_key, version, effective_from, effective_to, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        def.institutionId,
        def.name,
        def.description,
        def.formulaDefinition,
        def.denominatorDefinition,
        JSON.stringify(def.dataSources),
        def.calculatorKey,
        def.version,
        def.effectiveFrom,
        def.effectiveTo,
        def.status
      );
    return { ...def, id };
  }
}
