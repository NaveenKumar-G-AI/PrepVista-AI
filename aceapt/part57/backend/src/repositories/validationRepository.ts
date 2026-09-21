import { db } from '../db/client';
import { newId } from '../utils/ids';
import type { ValidationStatus, ValidationType } from '../domain/enums';

export interface ValidationRow {
  id: string;
  shortcut_id: string;
  version: number;
  validation_type: ValidationType;
  status: ValidationStatus;
  evidence: string;
  validator_version: string;
  validated_at: string;
}

export function insertValidation(input: {
  shortcutId: string;
  version: number;
  validationType: ValidationType;
  status: ValidationStatus;
  evidence: unknown;
  validatorVersion?: string;
}): ValidationRow {
  const id = newId('sval');
  db.prepare(
    `INSERT INTO shortcut_validations (id, shortcut_id, version, validation_type, status, evidence, validator_version)
     VALUES (@id, @shortcut_id, @version, @validation_type, @status, @evidence, @validator_version)`
  ).run({
    id,
    shortcut_id: input.shortcutId,
    version: input.version,
    validation_type: input.validationType,
    status: input.status,
    evidence: JSON.stringify(input.evidence),
    validator_version: input.validatorVersion ?? 'v1',
  });
  return db.prepare(`SELECT * FROM shortcut_validations WHERE id = ?`).get(id) as ValidationRow;
}

export function listValidations(shortcutId: string, version?: number): ValidationRow[] {
  if (version !== undefined) {
    return db
      .prepare(`SELECT * FROM shortcut_validations WHERE shortcut_id = ? AND version = ? ORDER BY validated_at DESC`)
      .all(shortcutId, version) as ValidationRow[];
  }
  return db.prepare(`SELECT * FROM shortcut_validations WHERE shortcut_id = ? ORDER BY validated_at DESC`).all(shortcutId) as ValidationRow[];
}
