import type { PoolClient } from "pg";
import type {
  AssessmentBlueprint,
  AssessmentProfile,
  Difficulty,
  Evidence,
  QuestionAttempt,
  ReadinessSnapshot,
  SimulationRecord,
  SimulationStatus,
} from "../domain/types.js";
import type { QuestionPoolItem } from "../simulation/blueprintGenerator.js";
import type { ReconciledAttempt } from "../simulation/eventProcessor.js";
import { newId } from "./ids.js";
import { pool } from "./pool.js";
import { withStudentContext } from "./withContext.js";

// ---------------------------------------------------------------------------
// Reference data — not student-scoped, no RLS
// ---------------------------------------------------------------------------

export async function getQuestionPool(topicIds?: string[]): Promise<QuestionPoolItem[]> {
  const { rows } = topicIds && topicIds.length > 0
    ? await pool.query(
        `SELECT id, topic_id, skill, difficulty, expected_time_seconds
         FROM questions WHERE is_active AND topic_id = ANY($1::uuid[])`,
        [topicIds]
      )
    : await pool.query(`SELECT id, topic_id, skill, difficulty, expected_time_seconds FROM questions WHERE is_active`);

  return rows.map((r) => ({
    id: r.id,
    topicId: r.topic_id,
    skill: r.skill,
    difficulty: r.difficulty as Difficulty,
    expectedTimeSeconds: r.expected_time_seconds,
  }));
}

export async function getQuestionsForDelivery(questionIds: string[]): Promise<
  Array<{ id: string; topicId: string; prompt: string; options: { id: string; text: string }[] }>
> {
  if (questionIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id, topic_id, prompt, options FROM questions WHERE id = ANY($1::uuid[])`,
    [questionIds]
  );
  return rows.map((r) => ({ id: r.id, topicId: r.topic_id, prompt: r.prompt, options: r.options }));
}

/** Review-only: includes the answer key and explanation. Never call this for
 * an in-progress simulation's delivery payload — use getQuestionsForDelivery
 * for that. */
export async function getQuestionsWithAnswerKey(questionIds: string[]): Promise<
  Array<{ id: string; prompt: string; options: { id: string; text: string }[]; correctOptionId: string; explanation: string | null }>
> {
  if (questionIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id, prompt, options, correct_option_id, explanation FROM questions WHERE id = ANY($1::uuid[])`,
    [questionIds]
  );
  return rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    options: r.options,
    correctOptionId: r.correct_option_id,
    explanation: r.explanation,
  }));
}

export async function getAnswerKey(questionIds: string[]): Promise<Map<string, string>> {
  if (questionIds.length === 0) return new Map();
  const { rows } = await pool.query(`SELECT id, correct_option_id FROM questions WHERE id = ANY($1::uuid[])`, [questionIds]);
  return new Map(rows.map((r) => [r.id as string, r.correct_option_id as string]));
}

export async function getAssessmentProfile(profileId: string): Promise<AssessmentProfile | null> {
  const { rows } = await pool.query(`SELECT * FROM assessment_profiles WHERE id = $1 AND is_active`, [profileId]);
  const r = rows[0];
  if (!r) return null;
  return mapProfileRow(r);
}

export async function listAssessmentProfiles(): Promise<AssessmentProfile[]> {
  const { rows } = await pool.query(`SELECT * FROM assessment_profiles WHERE is_active ORDER BY name`);
  return rows.map(mapProfileRow);
}

function mapProfileRow(r: any): AssessmentProfile {
  return {
    id: r.id,
    name: r.name,
    assessmentType: r.assessment_type,
    durationMinutes: r.duration_minutes,
    questionCount: r.question_count,
    sections: r.sections,
    difficultyDistribution: r.difficulty_distribution,
    negativeMarking: r.negative_marking,
    scoringRules: r.scoring_rules,
    targetScore: r.target_score !== null ? Number(r.target_score) : null,
    questionTimeExpectationSeconds: r.question_time_expectation_seconds,
  };
}

export async function createBlueprint(blueprint: Omit<AssessmentBlueprint, "id">): Promise<string> {
  const id = newId();
  await pool.query(
    `INSERT INTO assessment_blueprints (id, profile_id, composition, validation) VALUES ($1, $2, $3, $4)`,
    [id, blueprint.profileId, JSON.stringify(blueprint.composition), JSON.stringify(blueprint.validation)]
  );
  return id;
}

// ---------------------------------------------------------------------------
// Students (RLS-protected stub — see db/migrations/0001_init.sql notes)
// ---------------------------------------------------------------------------

export async function getStudent(studentId: string): Promise<{ id: string; fullName: string; email: string } | null> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(`SELECT id, full_name, email FROM students WHERE id = $1`, [studentId]);
    const r = rows[0];
    return r ? { id: r.id, fullName: r.full_name, email: r.email } : null;
  });
}

// ---------------------------------------------------------------------------
// Simulation lifecycle — all RLS-scoped
// ---------------------------------------------------------------------------

export interface NewSimulationInput {
  studentId: string;
  profileId: string;
  blueprintId: string;
  practiceMode: SimulationRecord["practiceMode"];
  durationMinutes: number;
  composition: Array<{ questionId: string; section: string; expectedTimeSeconds: number; weight: number }>;
}

export async function createSimulation(input: NewSimulationInput): Promise<string> {
  const simulationId = newId();
  await withStudentContext(input.studentId, async (client) => {
    await client.query(
      `INSERT INTO simulations (id, student_id, profile_id, blueprint_id, practice_mode, status, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, 'not_started', $6)`,
      [simulationId, input.studentId, input.profileId, input.blueprintId, input.practiceMode, input.durationMinutes]
    );

    let seq = 1;
    for (const slot of input.composition) {
      await client.query(
        `INSERT INTO simulation_questions (id, simulation_id, student_id, question_id, section, sequence_order, expected_time_seconds, weight)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newId(), simulationId, input.studentId, slot.questionId, slot.section, seq, slot.expectedTimeSeconds, slot.weight]
      );
      seq += 1;
    }
  });
  return simulationId;
}

export interface SimulationQuestionRow {
  questionId: string;
  section: string;
  sequenceOrder: number;
  expectedTimeSeconds: number;
  weight: number;
}

export async function getSimulationQuestions(studentId: string, simulationId: string): Promise<SimulationQuestionRow[]> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT question_id, section, sequence_order, expected_time_seconds, weight
       FROM simulation_questions WHERE simulation_id = $1 ORDER BY sequence_order`,
      [simulationId]
    );
    return rows.map((r) => ({
      questionId: r.question_id,
      section: r.section,
      sequenceOrder: r.sequence_order,
      expectedTimeSeconds: r.expected_time_seconds,
      weight: Number(r.weight),
    }));
  });
}

export async function getQuestionMeta(questionIds: string[]): Promise<Map<string, { topicId: string; difficulty: Difficulty }>> {
  if (questionIds.length === 0) return new Map();
  const { rows } = await pool.query(`SELECT id, topic_id, difficulty FROM questions WHERE id = ANY($1::uuid[])`, [questionIds]);
  return new Map(rows.map((r) => [r.id as string, { topicId: r.topic_id as string, difficulty: r.difficulty as Difficulty }]));
}

export async function getSimulationMeta(
  studentId: string,
  simulationId: string
): Promise<{ profileId: string; practiceMode: string; status: string } | null> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(`SELECT profile_id, practice_mode, status FROM simulations WHERE id = $1`, [simulationId]);
    const r = rows[0];
    return r ? { profileId: r.profile_id, practiceMode: r.practice_mode, status: r.status } : null;
  });
}

export async function markSimulationStarted(studentId: string, simulationId: string, at?: Date): Promise<void> {
  await withStudentContext(studentId, async (client) => {
    await client.query(
      `UPDATE simulations SET status = 'in_progress', started_at = COALESCE(started_at, $2::timestamptz) WHERE id = $1`,
      [simulationId, at ?? new Date()]
    );
  });
}

export interface RawEventInput {
  questionId: string | null;
  eventType: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
}

export async function recordEvents(studentId: string, simulationId: string, events: RawEventInput[]): Promise<void> {
  if (events.length === 0) return;
  await withStudentContext(studentId, async (client) => {
    for (const e of events) {
      await client.query(
        `INSERT INTO simulation_question_events (id, simulation_id, student_id, question_id, event_type, event_timestamp, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId(), simulationId, studentId, e.questionId, e.eventType, e.eventTimestamp, JSON.stringify(e.payload ?? {})]
      );
    }
  });
}

export async function getEventsForSimulation(
  studentId: string,
  simulationId: string
): Promise<Array<{ questionId: string | null; eventType: string; eventTimestamp: string; payload: Record<string, unknown> }>> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT question_id, event_type, event_timestamp, payload FROM simulation_question_events
       WHERE simulation_id = $1 ORDER BY event_timestamp`,
      [simulationId]
    );
    return rows.map((r) => ({
      questionId: r.question_id,
      eventType: r.event_type,
      eventTimestamp: r.event_timestamp.toISOString(),
      payload: r.payload,
    }));
  });
}

export interface FinalizeSimulationInput {
  studentId: string;
  simulationId: string;
  attempts: Array<
    ReconciledAttempt & { topicId: string; difficulty: Difficulty; section: string; sequencePosition: number }
  >;
  totalScore: number;
  maxScore: number;
  accuracy: number;
  submittedAt?: Date;
}

export async function finalizeSimulation(input: FinalizeSimulationInput): Promise<void> {
  await withStudentContext(input.studentId, async (client) => {
    for (const a of input.attempts) {
      await client.query(
        `INSERT INTO simulation_attempts
           (id, simulation_id, student_id, question_id, topic_id, difficulty, section, sequence_position,
            selected_option_id, is_correct, time_spent_seconds, first_viewed_at, answered_at,
            skip_count, revisit_count, final_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (simulation_id, question_id) DO UPDATE SET
           selected_option_id = EXCLUDED.selected_option_id,
           is_correct = EXCLUDED.is_correct,
           time_spent_seconds = EXCLUDED.time_spent_seconds,
           first_viewed_at = EXCLUDED.first_viewed_at,
           answered_at = EXCLUDED.answered_at,
           skip_count = EXCLUDED.skip_count,
           revisit_count = EXCLUDED.revisit_count,
           final_status = EXCLUDED.final_status`,
        [
          newId(),
          input.simulationId,
          input.studentId,
          a.questionId,
          a.topicId,
          a.difficulty,
          a.section,
          a.sequencePosition,
          a.selectedOptionId,
          a.isCorrect,
          a.timeSpentSeconds,
          a.firstViewedAt,
          a.answeredAt,
          a.skipCount,
          a.revisitCount,
          a.finalStatus,
        ]
      );
    }

    await client.query(
      `UPDATE simulations SET status = 'submitted', submitted_at = $5::timestamptz, total_score = $2, max_score = $3, accuracy = $4
       WHERE id = $1`,
      [input.simulationId, input.totalScore, input.maxScore, input.accuracy, input.submittedAt ?? new Date()]
    );
  });
}

export async function markSimulationAbandoned(studentId: string, simulationId: string): Promise<void> {
  await withStudentContext(studentId, async (client) => {
    await client.query(`UPDATE simulations SET status = 'abandoned' WHERE id = $1 AND status != 'submitted'`, [simulationId]);
  });
}

/** Full simulation history for a student, shaped exactly as the engines
 * expect (domain/types.ts SimulationRecord) — this is the one query the
 * entire readiness engine ultimately depends on. */
export async function listSimulationsForStudent(studentId: string): Promise<SimulationRecord[]> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT
         s.id, s.student_id, s.profile_id, s.practice_mode, s.status, s.started_at, s.submitted_at,
         s.duration_minutes, s.total_score, s.max_score, s.accuracy, s.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'questionId', sa.question_id,
               'topicId', sa.topic_id,
               'topicName', t.name,
               'difficulty', sa.difficulty,
               'section', sa.section,
               'sequencePosition', sa.sequence_position,
               'selectedOptionId', sa.selected_option_id,
               'isCorrect', sa.is_correct,
               'timeSpentSeconds', sa.time_spent_seconds,
               'expectedTimeSeconds', sq.expected_time_seconds,
               'skipCount', sa.skip_count,
               'revisitCount', sa.revisit_count,
               'finalStatus', sa.final_status
             ) ORDER BY sa.sequence_position
           ) FILTER (WHERE sa.id IS NOT NULL),
           '[]'
         ) AS attempts
       FROM simulations s
       LEFT JOIN simulation_attempts sa ON sa.simulation_id = s.id
       LEFT JOIN simulation_questions sq ON sq.simulation_id = sa.simulation_id AND sq.question_id = sa.question_id
       LEFT JOIN topics t ON t.id = sa.topic_id
       WHERE s.student_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [studentId]
    );
    return rows.map(mapSimulationRow);
  });
}

export async function getSimulationRecord(studentId: string, simulationId: string): Promise<SimulationRecord | null> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT
         s.id, s.student_id, s.profile_id, s.practice_mode, s.status, s.started_at, s.submitted_at,
         s.duration_minutes, s.total_score, s.max_score, s.accuracy, s.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'questionId', sa.question_id,
               'topicId', sa.topic_id,
               'topicName', t.name,
               'difficulty', sa.difficulty,
               'section', sa.section,
               'sequencePosition', sa.sequence_position,
               'selectedOptionId', sa.selected_option_id,
               'isCorrect', sa.is_correct,
               'timeSpentSeconds', sa.time_spent_seconds,
               'expectedTimeSeconds', sq.expected_time_seconds,
               'skipCount', sa.skip_count,
               'revisitCount', sa.revisit_count,
               'finalStatus', sa.final_status
             ) ORDER BY sa.sequence_position
           ) FILTER (WHERE sa.id IS NOT NULL),
           '[]'
         ) AS attempts
       FROM simulations s
       LEFT JOIN simulation_attempts sa ON sa.simulation_id = s.id
       LEFT JOIN simulation_questions sq ON sq.simulation_id = sa.simulation_id AND sq.question_id = sa.question_id
       LEFT JOIN topics t ON t.id = sa.topic_id
       WHERE s.student_id = $1 AND s.id = $2
       GROUP BY s.id`,
      [studentId, simulationId]
    );
    const r = rows[0];
    return r ? mapSimulationRow(r) : null;
  });
}

function mapSimulationRow(r: any): SimulationRecord {
  return {
    id: r.id,
    studentId: r.student_id,
    profileId: r.profile_id,
    practiceMode: r.practice_mode,
    status: r.status as SimulationStatus,
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
    durationMinutes: r.duration_minutes,
    totalScore: r.total_score !== null ? Number(r.total_score) : null,
    maxScore: r.max_score !== null ? Number(r.max_score) : null,
    accuracy: r.accuracy !== null ? Number(r.accuracy) : null,
    attempts: (r.attempts as QuestionAttempt[]) ?? [],
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Readiness snapshots
// ---------------------------------------------------------------------------

export async function saveReadinessSnapshot(snapshot: ReadinessSnapshot): Promise<void> {
  await withStudentContext(snapshot.studentId, async (client) => {
    await client.query(
      `INSERT INTO readiness_snapshots
         (id, student_id, profile_id, previous_snapshot_id, created_at, overall_score, overall_state,
          confidence_level, confidence_score, evidence_count, simulation_ids, dimension_scores, gap_map, contributors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        snapshot.id,
        snapshot.studentId,
        snapshot.profileId,
        snapshot.previousSnapshotId,
        snapshot.createdAt,
        snapshot.overallScore,
        snapshot.overallState,
        snapshot.confidence.level,
        snapshot.confidence.score,
        snapshot.evidenceCount,
        JSON.stringify(snapshot.simulationIds),
        JSON.stringify(snapshot.dimensions),
        JSON.stringify(snapshot.gaps),
        JSON.stringify(snapshot.contributors),
      ]
    );

    for (const d of snapshot.dimensions) {
      await client.query(
        `INSERT INTO readiness_dimension_scores (id, snapshot_id, student_id, dimension_key, score, status, confidence, evidence_summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newId(), snapshot.id, snapshot.studentId, d.dimensionKey, d.score, d.status, d.confidence, d.evidenceSummary]
      );
    }
    for (const g of snapshot.gaps) {
      await client.query(
        `INSERT INTO readiness_gaps (id, snapshot_id, student_id, dimension_key, severity, description, evidence_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newId(), snapshot.id, snapshot.studentId, g.dimensionKey, g.severity, g.description, JSON.stringify(g.evidenceIds)]
      );
    }
    for (const e of snapshot.evidence) {
      await client.query(
        `INSERT INTO readiness_evidence
           (id, snapshot_id, student_id, dimension_key, claim, observation, sample_size, time_window, confidence, supporting_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          e.id,
          snapshot.id,
          snapshot.studentId,
          e.dimensionKey,
          e.claim,
          e.observation,
          e.sampleSize,
          e.timeWindow,
          e.confidence,
          JSON.stringify(e.supportingData),
        ]
      );
    }
  });
}

export async function getLatestReadinessSnapshot(studentId: string): Promise<ReadinessSnapshot | null> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM readiness_snapshots WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [studentId]
    );
    const r = rows[0];
    if (!r) return null;
    return hydrateSnapshot(client, r);
  });
}

export async function listReadinessSnapshots(studentId: string, limit = 20): Promise<ReadinessSnapshot[]> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM readiness_snapshots WHERE student_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [studentId, limit]
    );
    const out: ReadinessSnapshot[] = [];
    for (const r of rows) out.push(await hydrateSnapshot(client, r));
    return out;
  });
}

async function hydrateSnapshot(client: PoolClient, r: any): Promise<ReadinessSnapshot> {
  const { rows: evidenceRows } = await client.query(`SELECT * FROM readiness_evidence WHERE snapshot_id = $1`, [r.id]);
  const evidence: Evidence[] = evidenceRows.map((e: any) => ({
    id: e.id,
    dimensionKey: e.dimension_key,
    claim: e.claim,
    observation: e.observation,
    sampleSize: e.sample_size,
    timeWindow: e.time_window,
    confidence: e.confidence,
    supportingData: e.supporting_data,
  }));

  return {
    id: r.id,
    studentId: r.student_id,
    profileId: r.profile_id,
    previousSnapshotId: r.previous_snapshot_id,
    createdAt: new Date(r.created_at).toISOString(),
    overallScore: Number(r.overall_score),
    overallState: r.overall_state,
    confidence: { level: r.confidence_level, score: Number(r.confidence_score), limitingFactors: [] },
    evidenceCount: r.evidence_count,
    simulationIds: r.simulation_ids,
    dimensions: r.dimension_scores,
    gaps: r.gap_map,
    evidence,
    contributors: r.contributors,
  };
}

// ---------------------------------------------------------------------------
// Interventions (Feature 12 ledger)
// ---------------------------------------------------------------------------

export async function createIntervention(input: {
  studentId: string;
  readinessSnapshotId: string;
  gapDimensionKey: string;
  interventionType: string;
}): Promise<string> {
  const id = newId();
  await withStudentContext(input.studentId, async (client) => {
    await client.query(
      `INSERT INTO interventions (id, student_id, readiness_snapshot_id, gap_dimension_key, intervention_type)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, input.studentId, input.readinessSnapshotId, input.gapDimensionKey, input.interventionType]
    );
  });
  return id;
}

export async function completeIntervention(studentId: string, interventionId: string, resultingSimulationId: string): Promise<void> {
  await withStudentContext(studentId, async (client) => {
    await client.query(
      `UPDATE interventions SET status = 'completed', completed_at = now(), resulting_simulation_id = $2 WHERE id = $1`,
      [interventionId, resultingSimulationId]
    );
  });
}

export async function listInterventions(studentId: string): Promise<
  Array<{ id: string; gapDimensionKey: string; interventionType: string; status: string; createdAt: string; resultingSimulationId: string | null }>
> {
  return withStudentContext(studentId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, gap_dimension_key, intervention_type, status, created_at, resulting_simulation_id
       FROM interventions WHERE student_id = $1 ORDER BY created_at DESC`,
      [studentId]
    );
    return rows.map((r) => ({
      id: r.id,
      gapDimensionKey: r.gap_dimension_key,
      interventionType: r.intervention_type,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      resultingSimulationId: r.resulting_simulation_id,
    }));
  });
}
