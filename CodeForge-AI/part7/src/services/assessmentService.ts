import { PoolClient } from 'pg';
import { AssessmentType, AssistanceLevel, appError } from '../types';
import { getActiveBlueprintVersion, lockBlueprintVersionIfNeeded } from './blueprintService';
import { selectChallenges } from './challengeSelectionService';
import { logEvent } from './eventService';
import { ASSESSMENT_DEFAULTS } from '../config/readinessConfig';
import { withAdmin } from '../db';

export interface CreateAssessmentInput {
  studentId: string;
  roleId: string;
  blueprintName: string;
  assessmentType: AssessmentType;
  purpose: string;
  language: 'python' | 'javascript' | 'java' | 'cpp';
  assistanceLevel?: AssistanceLevel;
  durationMinutes?: number;
  /** Optional — when provided, a retried create-assessment call with the SAME key returns the original assessment instead of creating a duplicate (closes the gap noted in the truth table: previously only submission had this). */
  creationIdempotencyKey?: string;
}

/**
 * Creates a deterministic assessment blueprint instance (section 10):
 * freezes a snapshot of the blueprint version's weights/gates/distribution
 * onto the assessment itself (config_snapshot), so later re-versioning the
 * blueprint can never retroactively change what this assessment measured
 * (section 7, tested in scripts/test_blueprint_versioning.ts).
 */
export async function createAssessment(client: PoolClient, input: CreateAssessmentInput) {
  if (input.creationIdempotencyKey) {
    const { rows: existing } = await client.query(
      `SELECT * FROM assessments WHERE student_id=$1 AND creation_idempotency_key=$2`,
      [input.studentId, input.creationIdempotencyKey]
    );
    if (existing.length > 0) return existing[0];
  }

  const version = await getActiveBlueprintVersion(client, input.roleId, input.blueprintName);
  // role_blueprint_versions deliberately has NO update policy for the
  // ordinary app role (see db/migrations/003) — students must never be able
  // to write blueprint/reference data. Locking-on-first-use is a system
  // integrity operation, not a student action, so it runs on the admin
  // connection specifically (same reasoning as the hidden-tests fetch in
  // submissionService.ts). Running this through `client` instead would
  // silently affect 0 rows under RLS rather than error — caught by
  // scripts/test_blueprint_versioning.ts.
  await withAdmin((adminClient) => lockBlueprintVersionIfNeeded(adminClient, version.id));

  const selected = await selectChallenges(
    client,
    input.studentId,
    version.competency_weights,
    version.difficulty_distribution,
    input.language
  );
  if (selected.length === 0) {
    throw appError('NO_CHALLENGES_AVAILABLE', 'No validated challenges available for this role/language combination', 422);
  }

  const defaults =
    ASSESSMENT_DEFAULTS[input.assessmentType as keyof typeof ASSESSMENT_DEFAULTS] || ASSESSMENT_DEFAULTS.role_readiness;
  const durationMinutes = input.durationMinutes ?? defaults.durationMinutes;

  const configSnapshot = {
    competency_weights: version.competency_weights,
    difficulty_distribution: version.difficulty_distribution,
    readiness_gates: version.readiness_gates,
    blueprint_version_number: version.version_number,
  };

  const {
    rows: [assessment],
  } = await client.query(
    `INSERT INTO assessments (student_id, role_id, blueprint_version_id, assessment_type, purpose, status, assistance_level, duration_minutes, config_snapshot, creation_idempotency_key)
     VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8,$9) RETURNING *`,
    [
      input.studentId,
      input.roleId,
      version.id,
      input.assessmentType,
      input.purpose,
      input.assistanceLevel || 'none',
      durationMinutes,
      JSON.stringify(configSnapshot),
      input.creationIdempotencyKey ?? null,
    ]
  );

  let seq = 0;
  for (const s of selected) {
    await client.query(
      `INSERT INTO assessment_challenges (assessment_id, challenge_id, skill_id, sequence_order, weight, is_unseen, is_transfer_probe)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [assessment.id, s.challenge_id, s.skill_id, seq++, s.weight, s.is_unseen, s.is_transfer_probe]
    );
    await client.query(
      `INSERT INTO challenge_exposure (student_id, challenge_id, times_used_in_assessment)
       VALUES ($1,$2,1)
       ON CONFLICT (student_id, challenge_id) DO UPDATE SET times_used_in_assessment = challenge_exposure.times_used_in_assessment + 1`,
      [input.studentId, s.challenge_id]
    );
  }

  await logEvent(client, assessment.id, 'ASSESSMENT_CREATED', {
    assessment_type: input.assessmentType,
    challenge_count: selected.length,
    blueprint_version: version.version_number,
  });

  return assessment;
}
