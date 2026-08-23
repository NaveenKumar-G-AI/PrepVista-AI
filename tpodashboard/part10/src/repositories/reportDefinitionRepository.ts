import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface ReportDefinition {
  id: string;
  institutionId: string;
  name: string;
  type: string;
  version: number;
  sections: string[];
  metricConfig: string[];
  visibility: "tpo" | "management" | "student";
  createdBy: string;
  updatedAt: string;
}

function toDefinition(row: any): ReportDefinition {
  return {
    id: row.id,
    institutionId: row.institution_id,
    name: row.name,
    type: row.type,
    version: row.version,
    sections: JSON.parse(row.sections),
    metricConfig: JSON.parse(row.metric_config),
    visibility: row.visibility,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

export class ReportDefinitionRepository {
  constructor(private db: Database.Database) {}

  create(input: Omit<ReportDefinition, "id" | "updatedAt">): ReportDefinition {
    const id = randomUUID();
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO report_definitions
         (id, institution_id, name, type, version, sections, metric_config, visibility, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.institutionId,
        input.name,
        input.type,
        input.version,
        JSON.stringify(input.sections),
        JSON.stringify(input.metricConfig),
        input.visibility,
        input.createdBy,
        updatedAt
      );
    return { ...input, id, updatedAt };
  }

  getLatest(institutionId: string, name: string): ReportDefinition {
    const row = this.db
      .prepare(
        `SELECT * FROM report_definitions WHERE institution_id = ? AND name = ?
         ORDER BY version DESC LIMIT 1`
      )
      .get(institutionId, name);
    if (!row) {
      throw new Error(`No report_definition found named "${name}" for institution ${institutionId}.`);
    }
    return toDefinition(row);
  }
}
