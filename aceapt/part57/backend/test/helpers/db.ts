import fs from 'node:fs';
import path from 'node:path';
import { db } from '../../src/db/client';

const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'), 'utf-8');

export function migrate(): void {
  db.exec(schema);
}

/** Wipes all rows (FK-safe order) so each test starts from a clean slate without recreating the in-memory db. */
export function resetDb(): void {
  db.exec(`
    DELETE FROM analytics_events;
    DELETE FROM shortcut_training_attempts;
    DELETE FROM shortcut_discoveries;
    DELETE FROM shortcut_usages;
    DELETE FROM student_shortcut_states;
    DELETE FROM shortcut_validations;
    DELETE FROM shortcut_examples;
    DELETE FROM shortcut_versions;
    DELETE FROM shortcuts;
  `);
}
