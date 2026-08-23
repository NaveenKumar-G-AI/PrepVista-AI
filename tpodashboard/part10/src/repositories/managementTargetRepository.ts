import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface ManagementTarget {
  id: string;
  institutionId: string;
  season: string;
  metricName: string;
  targetValue: number;
  setBy: string;
}

export class ManagementTargetRepository {
  constructor(private db: Database.Database) {}

  set(input: Omit<ManagementTarget, "id">): ManagementTarget {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO management_targets (id, institution_id, season, metric_name, target_value, set_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(institution_id, season, metric_name)
         DO UPDATE SET target_value = excluded.target_value, set_by = excluded.set_by, created_at = excluded.created_at`
      )
      .run(id, input.institutionId, input.season, input.metricName, input.targetValue, input.setBy, new Date().toISOString());
    return { ...input, id };
  }

  get(institutionId: string, season: string, metricName: string): number | null {
    const row = this.db
      .prepare(
        "SELECT target_value FROM management_targets WHERE institution_id = ? AND season = ? AND metric_name = ?"
      )
      .get(institutionId, season, metricName) as { target_value: number } | undefined;
    return row ? row.target_value : null;
  }
}
