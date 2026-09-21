import * as trainingRepo from '../repositories/trainingRepository';
import * as shortcutRepo from '../repositories/shortcutRepository';
import * as stateRepo from '../repositories/studentStateRepository';
import * as analytics from '../repositories/analyticsRepository';
import type { TrainingActivityType } from '../domain/enums';
import { DomainError } from '../domain/types';

export interface TrainingPrompt {
  activityType: TrainingActivityType;
  shortcutId: string | null;
  promptRef: string;
  prompt: unknown;
}

/**
 * Builds a training prompt for one of the seven activity types from secs.
 * 62-67 and 179-187. Deliberately reuses a shortcut's own stored examples
 * and counterexamples as training material rather than generating new
 * questions - real question generation/selection belongs to Features 53/54,
 * which don't exist in this build (see README "Known limitations").
 */
export function startTraining(input: { tenantId: string; studentId: string; activityType: TrainingActivityType; shortcutId: string }): TrainingPrompt {
  const shortcut = shortcutRepo.getShortcutById(input.shortcutId);
  if (!shortcut) throw new DomainError('Unknown shortcut.', 404, 'NOT_FOUND');
  const version = shortcutRepo.getLatestVersion(shortcut.shortcut_id);
  const examples = version ? shortcutRepo.listExamples(shortcut.shortcut_id, version.version) : [];
  const positives = examples.filter((e) => !e.is_counterexample);
  const negatives = examples.filter((e) => e.is_counterexample);

  const promptRef = `${input.activityType}:${shortcut.shortcut_id}:${Date.now()}`;
  let prompt: unknown;

  switch (input.activityType) {
    case 'RECALL':
      prompt = { instructions: `Problem family: ${shortcut.domain || shortcut.category}. What strategy would you use, and why?`, showShortcut: false };
      break;
    case 'SELECTION': {
      const decoys = shortcutRepo.listVisibleByFamily(input.tenantId, input.studentId, shortcut.question_family_id ?? '').filter(
        (s) => s.shortcut_id !== shortcut.shortcut_id
      );
      prompt = {
        instructions: 'Which method best fits this problem?',
        options: [shortcut.canonical_name, ...decoys.slice(0, 2).map((d) => d.canonical_name), 'Standard method'],
        correctOption: shortcut.canonical_name,
      };
      break;
    }
    case 'APPLICATION':
      prompt = { instructions: `Apply "${shortcut.canonical_name}" to solve this example.`, example: positives[0] ?? null };
      break;
    case 'VERIFICATION':
      prompt = {
        instructions: `Is "${shortcut.canonical_name}" applicable to this problem?`,
        example: negatives[0] ?? positives[0] ?? null,
        expectedAnswer: negatives[0] ? 'NOT_APPLICABLE' : 'APPLICABLE',
      };
      break;
    case 'TRANSFER':
      prompt = { instructions: 'This problem is worded differently from what you have practiced. Does the method still apply?', example: positives[positives.length - 1] ?? null };
      break;
    case 'PRESSURE':
      prompt = { instructions: 'Retrieve and apply the method quickly.', timeLimitSeconds: 20, example: positives[0] ?? null };
      break;
    case 'RETENTION':
      prompt = { instructions: `What condition does "${shortcut.canonical_name}" require, and what does it do?`, showShortcut: false };
      break;
    default:
      throw new DomainError('Unknown training activity type.', 400, 'BAD_REQUEST');
  }

  analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'shortcut_training_started', payload: { activityType: input.activityType, shortcutId: shortcut.shortcut_id } });

  return { activityType: input.activityType, shortcutId: shortcut.shortcut_id, promptRef, prompt };
}

export function submitTraining(input: {
  tenantId: string;
  studentId: string;
  shortcutId: string | null;
  activityType: TrainingActivityType;
  promptRef: string;
  response: unknown;
  correct: boolean;
  responseTimeMs?: number;
}): trainingRepo.TrainingAttemptRow {
  const attempt = trainingRepo.insertTrainingAttempt(input);

  if (input.shortcutId) {
    const state = stateRepo.getOrCreateState(input.tenantId, input.studentId, input.shortcutId);
    if (input.activityType === 'TRANSFER') {
      const prev = JSON.parse(state.transfer_evidence || '{}') as { attempts?: number; correct?: number };
      stateRepo.updateTransferEvidence(state.id, {
        attempts: (prev.attempts ?? 0) + 1,
        correct: (prev.correct ?? 0) + (input.correct ? 1 : 0),
        lastAt: new Date().toISOString(),
      });
      analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'strategy_transfer', payload: { shortcutId: input.shortcutId, correct: input.correct } });
    }
    if (input.activityType === 'RETENTION') {
      const prev = JSON.parse(state.retention_evidence || '{}') as { attempts?: number; correct?: number };
      stateRepo.updateRetentionEvidence(state.id, {
        attempts: (prev.attempts ?? 0) + 1,
        correct: (prev.correct ?? 0) + (input.correct ? 1 : 0),
        lastAt: new Date().toISOString(),
      });
      analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'strategy_retention', payload: { shortcutId: input.shortcutId, correct: input.correct } });
    }
    if (input.activityType === 'SELECTION') {
      analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'strategy_selection', payload: { shortcutId: input.shortcutId, correct: input.correct } });
    }
  }

  analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'shortcut_training_completed', payload: { activityType: input.activityType, correct: input.correct } });

  return attempt;
}

/**
 * Very small "what should this student practice next" heuristic (sec. 150,
 * 174 "Today's focus") derived from recent attempt accuracy per activity
 * type. Not a substitute for the real adaptive-support system (sec.
 * 151-153) - just enough to make the library's "Today's focus" line honest.
 */
export function currentFocus(studentId: string): TrainingActivityType | null {
  const order: TrainingActivityType[] = ['RECALL', 'SELECTION', 'APPLICATION', 'VERIFICATION', 'TRANSFER', 'PRESSURE', 'RETENTION'];
  for (const activityType of order) {
    const recent = trainingRepo.listRecentAttempts(studentId, activityType, 5);
    if (recent.length === 0) continue;
    const accuracy = recent.filter((a) => a.correct === 1).length / recent.length;
    if (accuracy < 0.7) return activityType;
  }
  return null;
}
