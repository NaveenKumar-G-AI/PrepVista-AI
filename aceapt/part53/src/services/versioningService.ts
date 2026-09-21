import { QuestionRepository } from '../db/repository.js';
import { NotFoundError } from '../errors.js';
import { generateId, now } from '../utils/misc.js';
import { QuestionVersion } from '../types/domain.js';
import { QuestionQualityService } from './questionQualityService.js';

const TRACKED_FIELDS: (keyof QuestionVersion)[] = [
  'content',
  'options',
  'answerKey',
  'multiSelect',
  'solution',
  'computation',
  'skillMapping',
  'difficultyMetadata',
  'purpose',
];

function diffFields(prev: QuestionVersion, next: Partial<QuestionVersion>): string[] {
  const changed: string[] = [];
  for (const field of TRACKED_FIELDS) {
    if (field in next && JSON.stringify(next[field]) !== JSON.stringify(prev[field])) {
      changed.push(field);
    }
  }
  return changed;
}

/**
 * Section 71: "Every published change must be traceable." Old versions are never mutated or
 * deleted (section 56/162 — "History remains traceable") — every edit produces a brand-new
 * QuestionVersion row with an incremented versionNumber, and every edit automatically re-enters
 * the validation pipeline (section 105/72: answer/option/solution/skill changes must revalidate).
 */
export class VersioningService {
  constructor(private repo: QuestionRepository, private quality: QuestionQualityService) {}

  async createNewVersion(
    questionId: string,
    changes: Partial<Omit<QuestionVersion, 'id' | 'questionId' | 'versionNumber' | 'createdAt'>>,
    actor: string,
  ): Promise<QuestionVersion> {
    const question = this.repo.getQuestion(questionId);
    if (!question) throw new NotFoundError(`Question ${questionId} not found.`);
    const current = this.repo.getCurrentVersion(questionId);
    if (!current) throw new NotFoundError(`Question ${questionId} has no current version.`);

    const changedFields = diffFields(current, changes);
    const nextVersion: QuestionVersion = {
      ...current,
      ...changes,
      id: generateId(),
      questionId,
      versionNumber: current.versionNumber + 1,
      createdAt: now(),
      createdBy: actor,
      changedFields,
    };

    this.repo.saveVersion(nextVersion); // current's row is untouched — history is preserved
    question.currentVersionId = nextVersion.id;
    this.repo.saveQuestion(question);

    await this.quality.validateQuestion(nextVersion.id);
    return nextVersion;
  }
}
