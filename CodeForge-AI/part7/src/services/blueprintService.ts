import { PoolClient } from 'pg';
import { CompetencyWeight, DifficultyDistribution, ReadinessGates, appError } from '../types';
import { DEFAULT_READINESS_GATES } from '../config/readinessConfig';

export interface BlueprintVersionInput {
  competencyWeights: CompetencyWeight[];
  difficultyDistribution: DifficultyDistribution;
  readinessGates?: ReadinessGates;
}

function assertWeightsSumToOne(weights: CompetencyWeight[]) {
  const sum = weights.reduce((acc, w) => acc + w.weight, 0);
  if (Math.abs(sum - 1) > 0.01) {
    throw appError('INVALID_BLUEPRINT', `Competency weights must sum to ~1.0 (got ${sum.toFixed(3)})`, 400);
  }
}

async function insertVersion(client: PoolClient, blueprintId: string, versionNumber: number, input: BlueprintVersionInput) {
  const {
    rows: [version],
  } = await client.query(
    `INSERT INTO role_blueprint_versions (blueprint_id, version_number, competency_weights, difficulty_distribution, readiness_gates)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      blueprintId,
      versionNumber,
      JSON.stringify(input.competencyWeights),
      JSON.stringify(input.difficultyDistribution),
      JSON.stringify(input.readinessGates || DEFAULT_READINESS_GATES),
    ]
  );
  return version;
}

/** Creates a new role blueprint plus its v1 version (sections 6-7). Run as an admin/TPO-level operation — role_blueprints has no INSERT policy for the ordinary app role by design (see db/migrations/003). */
export async function createBlueprint(
  client: PoolClient,
  input: { roleId: string; name: string } & BlueprintVersionInput
) {
  assertWeightsSumToOne(input.competencyWeights);
  const {
    rows: [bp],
  } = await client.query(`INSERT INTO role_blueprints (role_id, name) VALUES ($1, $2) RETURNING id`, [
    input.roleId,
    input.name,
  ]);
  const version = await insertVersion(client, bp.id, 1, input);
  await client.query(`UPDATE role_blueprints SET active_version_id = $1 WHERE id = $2`, [version.id, bp.id]);
  return { blueprintId: bp.id, version };
}

/** Adds a NEW version to an existing blueprint (section 7) — never mutates an old one; old assessments keep referencing their original version untouched. */
export async function createNewBlueprintVersion(client: PoolClient, blueprintId: string, input: BlueprintVersionInput) {
  assertWeightsSumToOne(input.competencyWeights);
  const {
    rows: [{ next }],
  } = await client.query(`SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM role_blueprint_versions WHERE blueprint_id = $1`, [
    blueprintId,
  ]);
  const version = await insertVersion(client, blueprintId, next, input);
  await client.query(`UPDATE role_blueprints SET active_version_id = $1 WHERE id = $2`, [version.id, blueprintId]);
  return version;
}

/** Marks a blueprint version locked — called the first time any assessment references it. Idempotent; a locked version's weights/gates/distribution can no longer change (enforced again, redundantly, by a DB trigger). */
export async function lockBlueprintVersionIfNeeded(client: PoolClient, blueprintVersionId: string) {
  await client.query(`UPDATE role_blueprint_versions SET is_locked = true WHERE id = $1 AND is_locked = false`, [blueprintVersionId]);
}

export async function getActiveBlueprintVersion(client: PoolClient, roleId: string, blueprintName: string) {
  const { rows } = await client.query(
    `SELECT v.* FROM role_blueprints b JOIN role_blueprint_versions v ON v.id = b.active_version_id
     WHERE b.role_id = $1 AND b.name = $2`,
    [roleId, blueprintName]
  );
  if (rows.length === 0) {
    throw appError('BLUEPRINT_NOT_FOUND', `No active blueprint "${blueprintName}" for role ${roleId}`, 404);
  }
  return rows[0];
}
