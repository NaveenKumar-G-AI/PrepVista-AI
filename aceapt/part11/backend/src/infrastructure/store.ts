import { InMemoryEventStore } from './inMemoryEventStore';
import { LearningBehaviorProfile } from '../types/profile';

/** Application-wide singleton. See inMemoryEventStore.ts for swap-out instructions. */
export const eventStore = new InMemoryEventStore();

/**
 * Minimal BehaviorSnapshot store (section 21) backing GET /behavior-history.
 * Every computed profile is appended here, giving a real (if in-memory)
 * history of how a student's behavior state evolved over time.
 */
class SnapshotStore {
  private snapshots: LearningBehaviorProfile[] = [];

  async save(profile: LearningBehaviorProfile): Promise<void> {
    this.snapshots.push(profile);
  }

  async history(studentId: string): Promise<LearningBehaviorProfile[]> {
    return this.snapshots.filter((s) => s.studentId === studentId);
  }
}
export const snapshotStore = new SnapshotStore();
