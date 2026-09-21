import { eventBus, type DomainEvent } from './eventBus';
import { questionSkillMappingRepository } from '../repositories/questionSkillMapping.repository';
import { evidenceRepository } from '../repositories/studentState.repository';
import { recomputeStudentSkillState } from '../services/studentSkillState.service';
import { invalidateGraphCache } from '../services/graphQuery.service';
import { logger } from '../utils/logger';

interface QuestionAttemptedPayload {
  questionId: string;
  isCorrect: boolean;
  context: 'DIAGNOSTIC' | 'PRACTICE' | 'ASSESSMENT';
  sourceRef?: string;
}

interface MistakeClassifiedPayload {
  questionId?: string;
  skillId?: string; // allows a direct skill hit when the mistake engine already resolved one
  sourceRef: string;
}

interface AssessmentCompletedPayload {
  assessmentId: string;
  results: Array<{ questionId: string; isCorrect: boolean }>;
}

interface GraphMaintenancePayload {
  skillId?: string;
}

/** Question -> skill(s) -> evidence event(s) -> recompute. Shared by QUESTION_ATTEMPTED and ASSESSMENT_COMPLETED. */
async function recordQuestionEvidence(studentId: string, questionId: string, isCorrect: boolean, eventType: string, sourceRef?: string) {
  const mappings = await questionSkillMappingRepository.findByQuestion(questionId);
  if (mappings.length === 0) {
    logger.debug('question_has_no_skill_mapping', { questionId });
    return;
  }
  const affectedSkillIds = new Set<string>();
  for (const mapping of mappings) {
    await evidenceRepository.createEvent({
      studentId,
      skillId: mapping.skillId,
      eventType,
      isCorrect,
      weight: mapping.weight,
      sourceRef: sourceRef ?? questionId,
      occurredAt: new Date(),
    });
    affectedSkillIds.add(mapping.skillId);
  }
  for (const skillId of affectedSkillIds) {
    await recomputeStudentSkillState(studentId, skillId);
  }
}

export function registerEventHandlers() {
  eventBus.subscribe<QuestionAttemptedPayload>('QUESTION_ATTEMPTED', async (event) => {
    await recordQuestionEvidence(event.studentId, event.payload.questionId, event.payload.isCorrect, event.payload.context, event.payload.sourceRef);
  });

  eventBus.subscribe<AssessmentCompletedPayload>('ASSESSMENT_COMPLETED', async (event) => {
    for (const result of event.payload.results) {
      await recordQuestionEvidence(event.studentId, result.questionId, result.isCorrect, 'ASSESSMENT', event.payload.assessmentId);
    }
  });

  eventBus.subscribe<MistakeClassifiedPayload>('MISTAKE_CLASSIFIED', async (event) => {
    let skillIds: string[] = [];
    if (event.payload.skillId) {
      skillIds = [event.payload.skillId];
    } else if (event.payload.questionId) {
      const mappings = await questionSkillMappingRepository.findByQuestion(event.payload.questionId);
      skillIds = mappings.map((m) => m.skillId);
    }
    for (const skillId of skillIds) {
      await evidenceRepository.createEvent({
        studentId: event.studentId,
        skillId,
        eventType: 'MISTAKE',
        isCorrect: false,
        weight: 1,
        sourceRef: event.payload.sourceRef,
        occurredAt: new Date(),
      });
      await recomputeStudentSkillState(event.studentId, skillId);
    }
  });

  // Live MasteryEngineAdapter/RetentionEngineAdapter implementations would
  // push these when the source-of-truth system updates, so this service's
  // cached StudentSkillState doesn't go stale between requests (section 66).
  eventBus.subscribe<GraphMaintenancePayload>('MASTERY_UPDATED', async (event) => {
    if (event.payload.skillId) await recomputeStudentSkillState(event.studentId, event.payload.skillId);
  });
  eventBus.subscribe<GraphMaintenancePayload>('RETENTION_UPDATED', async (event) => {
    if (event.payload.skillId) await recomputeStudentSkillState(event.studentId, event.payload.skillId);
  });
  eventBus.subscribe('GOAL_UPDATED', async (event) => {
    // Goal relevance is read live via GoalEngineAdapter on every priority-signal
    // request, so there's nothing to recompute here — this hook exists so a
    // real integration has somewhere to plug in cache invalidation later.
    logger.debug('goal_updated_received', { studentId: event.studentId });
  });
}

/** Call after any admin mutation to skills/relationships (section 66 cache invalidation). */
export function notifyGraphStructureChanged() {
  invalidateGraphCache();
}
