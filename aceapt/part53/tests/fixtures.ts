import { generateId, now } from '../src/utils/misc.js';
import { QuestionVersion } from '../src/types/domain.js';
import { QuestionPurpose } from '../src/types/enums.js';

/** A minimal, always-schema-valid QuestionVersion. Pass overrides for whatever the test cares about. */
export function baseVersion(overrides: Partial<QuestionVersion> = {}): QuestionVersion {
  return {
    id: generateId(),
    questionId: overrides.questionId ?? generateId(),
    versionNumber: 1,
    content: 'Sample question stem?',
    options: [
      { id: 'A', text: 'Option A' },
      { id: 'B', text: 'Option B' },
      { id: 'C', text: 'Option C' },
    ],
    answerKey: ['A'],
    multiSelect: false,
    purpose: QuestionPurpose.PRACTICE,
    createdAt: now(),
    ...overrides,
  };
}
