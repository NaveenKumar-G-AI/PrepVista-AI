import { db } from '../db/client';
import { newId } from '../utils/ids';
import type { ShortcutRow, ShortcutVersionRow } from '../domain/types';
import type { ShortcutSource, ShortcutStatus, StrategyClassification, StrategyType } from '../domain/enums';

export interface NewShortcutInput {
  tenantId: string;
  ownerStudentId: string | null;
  canonicalName: string;
  description: string;
  category: string;
  domain: string;
  skillId?: string | null;
  formulaId?: string | null;
  questionFamilyId?: string | null;
  strategyType: StrategyType;
  classification: StrategyClassification;
  source: ShortcutSource;
  status?: ShortcutStatus;
  riskLevel?: string;
  requiresOptions?: boolean;
  isApproximation?: boolean;
  acceptableError?: number | null;
}

export function insertShortcut(input: NewShortcutInput): ShortcutRow {
  const id = newId('shortcut');
  db.prepare(
    `INSERT INTO shortcuts (
      shortcut_id, tenant_id, owner_student_id, canonical_name, description, category, domain,
      skill_id, formula_id, question_family_id, strategy_type, classification, source, status,
      risk_level, requires_options, is_approximation, acceptable_error, current_version
    ) VALUES (@shortcut_id, @tenant_id, @owner_student_id, @canonical_name, @description, @category, @domain,
      @skill_id, @formula_id, @question_family_id, @strategy_type, @classification, @source, @status,
      @risk_level, @requires_options, @is_approximation, @acceptable_error, 1)`
  ).run({
    shortcut_id: id,
    tenant_id: input.tenantId,
    owner_student_id: input.ownerStudentId,
    canonical_name: input.canonicalName,
    description: input.description,
    category: input.category,
    domain: input.domain,
    skill_id: input.skillId ?? null,
    formula_id: input.formulaId ?? null,
    question_family_id: input.questionFamilyId ?? null,
    strategy_type: input.strategyType,
    classification: input.classification,
    source: input.source,
    status: input.status ?? 'UNVERIFIED',
    risk_level: input.riskLevel ?? 'UNKNOWN',
    requires_options: input.requiresOptions ? 1 : 0,
    is_approximation: input.isApproximation ? 1 : 0,
    acceptable_error: input.acceptableError ?? null,
  });
  return getShortcutById(id)!;
}

export function getShortcutById(shortcutId: string): ShortcutRow | undefined {
  return db.prepare(`SELECT * FROM shortcuts WHERE shortcut_id = ?`).get(shortcutId) as ShortcutRow | undefined;
}

/** Global shortcuts, plus this student's own personal ones. Never another student's. */
export function listVisibleShortcuts(tenantId: string, studentId: string): ShortcutRow[] {
  return db
    .prepare(
      `SELECT * FROM shortcuts
       WHERE tenant_id = ? AND (owner_student_id IS NULL OR owner_student_id = ?)
         AND status != 'DISABLED'
       ORDER BY created_at DESC`
    )
    .all(tenantId, studentId) as ShortcutRow[];
}

export function listVisibleByFamily(tenantId: string, studentId: string, questionFamilyId: string): ShortcutRow[] {
  return db
    .prepare(
      `SELECT * FROM shortcuts
       WHERE tenant_id = ? AND (owner_student_id IS NULL OR owner_student_id = ?)
         AND question_family_id = ? AND status NOT IN ('DISABLED', 'DEPRECATED')
       ORDER BY created_at ASC`
    )
    .all(tenantId, studentId, questionFamilyId) as ShortcutRow[];
}

export function searchVisibleShortcuts(tenantId: string, studentId: string, query: string): ShortcutRow[] {
  const like = `%${query.toLowerCase()}%`;
  return db
    .prepare(
      `SELECT * FROM shortcuts
       WHERE tenant_id = ? AND (owner_student_id IS NULL OR owner_student_id = ?)
         AND status != 'DISABLED'
         AND (lower(canonical_name) LIKE ? OR lower(description) LIKE ? OR lower(category) LIKE ? OR lower(domain) LIKE ?)
       ORDER BY created_at DESC`
    )
    .all(tenantId, studentId, like, like, like, like) as ShortcutRow[];
}

export function listAllForAdmin(tenantId: string, status?: string): ShortcutRow[] {
  if (status) {
    return db.prepare(`SELECT * FROM shortcuts WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC`).all(tenantId, status) as ShortcutRow[];
  }
  return db.prepare(`SELECT * FROM shortcuts WHERE tenant_id = ? ORDER BY created_at DESC`).all(tenantId) as ShortcutRow[];
}

export function updateShortcutStatus(shortcutId: string, status: ShortcutStatus): void {
  db.prepare(`UPDATE shortcuts SET status = ?, updated_at = datetime('now') WHERE shortcut_id = ?`).run(status, shortcutId);
}

export function updateShortcutCurrentVersion(shortcutId: string, version: number): void {
  db.prepare(`UPDATE shortcuts SET current_version = ?, updated_at = datetime('now') WHERE shortcut_id = ?`).run(version, shortcutId);
}

export function isOwnedByStudent(shortcut: ShortcutRow, studentId: string): boolean {
  return shortcut.owner_student_id === studentId;
}

// --- Versions ---------------------------------------------------------

export interface NewVersionInput {
  shortcutId: string;
  version: number;
  description: string;
  steps: string[];
  conditions: unknown[];
  nonApplicability: unknown[];
  underlyingReason: string;
  expression?: string | null;
  canonicalExpression?: string | null;
  validationDomain?: unknown | null;
  verificationMethod?: string;
  whenToUseText?: string;
  whenNotToUseText?: string;
}

export function insertVersion(input: NewVersionInput): ShortcutVersionRow {
  const id = newId('sver');
  db.prepare(
    `INSERT INTO shortcut_versions (
      id, shortcut_id, version, description, steps, conditions, non_applicability,
      underlying_reason, expression, canonical_expression, validation_domain, verification_method,
      when_to_use_text, when_not_to_use_text
    ) VALUES (@id, @shortcut_id, @version, @description, @steps, @conditions, @non_applicability,
      @underlying_reason, @expression, @canonical_expression, @validation_domain, @verification_method,
      @when_to_use_text, @when_not_to_use_text)`
  ).run({
    id,
    shortcut_id: input.shortcutId,
    version: input.version,
    description: input.description,
    steps: JSON.stringify(input.steps),
    conditions: JSON.stringify(input.conditions),
    non_applicability: JSON.stringify(input.nonApplicability),
    underlying_reason: input.underlyingReason,
    expression: input.expression ?? null,
    canonical_expression: input.canonicalExpression ?? null,
    validation_domain: input.validationDomain ? JSON.stringify(input.validationDomain) : null,
    verification_method: input.verificationMethod ?? 'MANUAL',
    when_to_use_text: input.whenToUseText ?? '',
    when_not_to_use_text: input.whenNotToUseText ?? '',
  });
  return getVersion(input.shortcutId, input.version)!;
}

export function getVersion(shortcutId: string, version: number): ShortcutVersionRow | undefined {
  return db.prepare(`SELECT * FROM shortcut_versions WHERE shortcut_id = ? AND version = ?`).get(shortcutId, version) as
    | ShortcutVersionRow
    | undefined;
}

export function getLatestVersion(shortcutId: string): ShortcutVersionRow | undefined {
  return db
    .prepare(`SELECT * FROM shortcut_versions WHERE shortcut_id = ? ORDER BY version DESC LIMIT 1`)
    .get(shortcutId) as ShortcutVersionRow | undefined;
}

// --- Examples -----------------------------------------------------------

export interface NewExampleInput {
  shortcutId: string;
  version: number;
  isCounterexample: boolean;
  input: Record<string, number>;
  expectedOutput?: number | null;
  questionId?: string | null;
  note?: string;
}

export function insertExample(input: NewExampleInput): void {
  db.prepare(
    `INSERT INTO shortcut_examples (id, shortcut_id, version, is_counterexample, input, expected_output, question_id, note)
     VALUES (@id, @shortcut_id, @version, @is_counterexample, @input, @expected_output, @question_id, @note)`
  ).run({
    id: newId('sex'),
    shortcut_id: input.shortcutId,
    version: input.version,
    is_counterexample: input.isCounterexample ? 1 : 0,
    input: JSON.stringify(input.input),
    expected_output: input.expectedOutput ?? null,
    question_id: input.questionId ?? null,
    note: input.note ?? '',
  });
}

export interface ExampleRow {
  id: string;
  shortcut_id: string;
  version: number;
  is_counterexample: number;
  input: string;
  expected_output: number | null;
  question_id: string | null;
  note: string;
  created_at: string;
}

export function listExamples(shortcutId: string, version: number): ExampleRow[] {
  return db
    .prepare(`SELECT * FROM shortcut_examples WHERE shortcut_id = ? AND version = ? ORDER BY created_at ASC`)
    .all(shortcutId, version) as ExampleRow[];
}
