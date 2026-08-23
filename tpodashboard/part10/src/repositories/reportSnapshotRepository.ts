import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ReportWarning } from "../types.js";

export interface ReportSnapshotInput {
  institutionId: string;
  reportDefinitionId: string;
  reportDefinitionVersion: number;
  season: string;
  filters: Record<string, unknown>;
  metricDefinitionVersions: Record<string, number>;
  dataThrough: string;
  payload: unknown;
  warnings: ReportWarning[];
  qualityScore: number;
  generatedBy: string;
}

export interface ReportSnapshot extends ReportSnapshotInput {
  id: string;
  generatedAt: string;
}

function toSnapshot(row: any): ReportSnapshot {
  return {
    id: row.id,
    institutionId: row.institution_id,
    reportDefinitionId: row.report_definition_id,
    reportDefinitionVersion: row.report_definition_version,
    season: row.season,
    filters: JSON.parse(row.filters),
    metricDefinitionVersions: JSON.parse(row.metric_definition_versions),
    dataThrough: row.data_through,
    payload: JSON.parse(row.payload),
    warnings: JSON.parse(row.warnings),
    qualityScore: row.quality_score,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by,
  };
}

/**
 * Snapshots are append-only and never mutated after creation. This is
 * what makes a "published report" reproducible months later even after
 * underlying source data, metric definitions, or report templates change
 * (spec section 44 / 78 final regression: "Reopen later -> Same historical
 * result"). See tests/reportSnapshot.test.ts for a test that proves it.
 */
export class ReportSnapshotRepository {
  constructor(private db: Database.Database) {}

  create(input: ReportSnapshotInput): ReportSnapshot {
    const id = randomUUID();
    const generatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO report_snapshots
         (id, institution_id, report_definition_id, report_definition_version, season,
          filters, metric_definition_versions, data_through, payload, warnings,
          quality_score, generated_at, generated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.institutionId,
        input.reportDefinitionId,
        input.reportDefinitionVersion,
        input.season,
        JSON.stringify(input.filters),
        JSON.stringify(input.metricDefinitionVersions),
        input.dataThrough,
        JSON.stringify(input.payload),
        JSON.stringify(input.warnings),
        input.qualityScore,
        generatedAt,
        input.generatedBy
      );
    return { ...input, id, generatedAt };
  }

  getById(id: string): ReportSnapshot | null {
    const row = this.db
      .prepare("SELECT * FROM report_snapshots WHERE id = ?")
      .get(id);
    return row ? toSnapshot(row) : null;
  }

  listForDefinition(reportDefinitionId: string): ReportSnapshot[] {
    return this.db
      .prepare(
        "SELECT * FROM report_snapshots WHERE report_definition_id = ? ORDER BY generated_at DESC"
      )
      .all(reportDefinitionId)
      .map(toSnapshot);
  }
}
