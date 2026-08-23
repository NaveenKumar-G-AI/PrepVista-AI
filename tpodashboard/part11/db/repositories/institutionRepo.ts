import { db, genId } from '../../src/lib/db';
import { InstitutionRow } from '../../src/types/models';

function mapRow(row: any): InstitutionRow {
  return { id: row.id, name: row.name, timezone: row.timezone, createdAt: row.created_at };
}

export function createInstitution(input: { name: string; timezone?: string }): InstitutionRow {
  const id = genId();
  db.prepare('INSERT INTO institutions (id, name, timezone) VALUES (?, ?, ?)')
    .run(id, input.name, input.timezone ?? 'Asia/Kolkata');
  return findInstitutionById(id)!;
}

export function findInstitutionById(id: string): InstitutionRow | undefined {
  const row = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}
