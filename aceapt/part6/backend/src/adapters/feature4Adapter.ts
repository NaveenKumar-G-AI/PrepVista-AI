import { Topic } from '../domain/types';

/**
 * Boundary to Feature 4 (Personalized Mastery Path). Feature 6 does not own
 * mastery-path planning (section 5) - it only reads "what is the path
 * currently prioritizing for this student" so PROGRESS_ASSESSMENT can auto-
 * focus on the right topics when the caller doesn't specify one explicitly.
 * No Feature 4 repository was provided, so this ships a mock behind the
 * interface (section 53).
 */
export interface MasteryPathAdapter {
  getCurrentFocusTopics(studentId: string): Promise<Topic[] | null>;
}

export class MockFeature4Adapter implements MasteryPathAdapter {
  private store = new Map<string, Topic[]>();

  /** Test/demo hook - simulates the mastery path currently prioritizing these topics. */
  setFocusTopics(studentId: string, topics: Topic[]): void {
    this.store.set(studentId, topics);
  }

  async getCurrentFocusTopics(studentId: string): Promise<Topic[] | null> {
    return this.store.get(studentId) ?? null;
  }
}

export const feature4Adapter = new MockFeature4Adapter();
