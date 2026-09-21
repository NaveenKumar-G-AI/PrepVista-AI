import { getDb, toJson } from '../db/db';
import { Assessment, AssessmentType, Topic } from '../domain/types';
import { newId, nowIso } from '../utils/ids';
import { audit } from '../utils/logger';
import { resolveBlueprint } from './blueprintService';
import { selectQuestions } from './questionSelectionService';
import { countCompletedAssessments } from './historyService';

export class InsufficientEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientEvidenceError';
  }
}

export interface CreateAssessmentOptions {
  focusTopics?: Topic[];
}

export async function createAssessment(
  studentId: string,
  type: AssessmentType,
  options: CreateAssessmentOptions = {}
): Promise<{ assessment: Assessment; warnings: string[] }> {
  const blueprint = resolveBlueprint(type, options);

  if (blueprint.minPriorAssessmentsRequired) {
    const priorCount = countCompletedAssessments(studentId);
    if (priorCount < blueprint.minPriorAssessmentsRequired) {
      throw new InsufficientEvidenceError(
        `${blueprint.label} requires at least ${blueprint.minPriorAssessmentsRequired} completed assessments first ` +
          `(this student has ${priorCount}). Take a Readiness Assessment or Full Mock first.`
      );
    }
  }

  const { questionIds, warnings } = selectQuestions(studentId, blueprint);
  if (questionIds.length === 0) {
    throw new Error('Question pool is empty - cannot generate an assessment. Has the database been seeded?');
  }

  const db = getDb();
  const id = newId('assessment');
  const createdAt = nowIso();

  const assessment: Assessment = {
    id,
    studentId,
    type,
    blueprintId: blueprint.id,
    status: 'NOT_STARTED',
    questionIds,
    durationSeconds: blueprint.durationSeconds,
    startedAt: null,
    endsAt: null,
    submittedAt: null,
    currentQuestionId: null,
    formLabel: 'FORM_A',
    createdAt,
  };

  db.prepare(
    `INSERT INTO assessments
      (id, student_id, type, blueprint_id, status, question_ids_json, duration_seconds, started_at, ends_at, submitted_at, current_question_id, form_label, created_at)
     VALUES (@id, @studentId, @type, @blueprintId, @status, @questionIdsJson, @durationSeconds, @startedAt, @endsAt, @submittedAt, @currentQuestionId, @formLabel, @createdAt)`
  ).run({
    id: assessment.id,
    studentId: assessment.studentId,
    type: assessment.type,
    blueprintId: assessment.blueprintId,
    status: assessment.status,
    questionIdsJson: toJson(assessment.questionIds),
    durationSeconds: assessment.durationSeconds,
    startedAt: null,
    endsAt: null,
    submittedAt: null,
    currentQuestionId: null,
    formLabel: assessment.formLabel,
    createdAt: assessment.createdAt,
  });

  audit('ASSESSMENT_CREATED', studentId, { assessmentId: id, type, questionCount: questionIds.length, warnings });

  if (questionIds.length < blueprint.questionCount) {
    warnings.push(
      `Generated ${questionIds.length}/${blueprint.questionCount} questions - the question bank is limited for some topics at this student's exposure state.`
    );
  }

  return { assessment, warnings };
}
