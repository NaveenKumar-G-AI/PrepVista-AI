import { SkillStateSnapshot, Topic } from '../domain/types';

/**
 * Boundary to Feature 3 (Skill Intelligence). Feature 6 does not own
 * long-term skill modeling (spec section 5) - it only ever READS a skill
 * snapshot through this interface. No repository for Feature 3 was provided,
 * so per section 53 ("If Feature 3/4/5 interfaces are not available yet:
 * Create adapters/interfaces") this file defines the contract Feature 6
 * needs and ships a mock behind it.
 *
 * IMPORTANT: the mock below is NOT a simulation of intelligence - it is an
 * inert lookup table that starts empty and only changes when something
 * explicitly calls setMastery(...). That keeps it honest: nothing here
 * invents a mastery number. Swap MockFeature3Adapter for a real HTTP/DB-backed
 * implementation of the same interface to integrate the real Feature 3.
 */
export interface SkillIntelligenceAdapter {
  getSkillState(studentId: string, skill: string): Promise<SkillStateSnapshot | null>;
  getSkillStatesForTopics(studentId: string, topics: Topic[]): Promise<SkillStateSnapshot[]>;
}

export class MockFeature3Adapter implements SkillIntelligenceAdapter {
  private store = new Map<string, SkillStateSnapshot>();

  private key(studentId: string, skill: string) {
    return `${studentId}::${skill}`;
  }

  /** Test/demo hook - explicitly simulates Feature 3 having learned something new. */
  setMastery(snapshot: SkillStateSnapshot): void {
    this.store.set(this.key(snapshot.studentId, snapshot.skill), snapshot);
  }

  async getSkillState(studentId: string, skill: string): Promise<SkillStateSnapshot | null> {
    return this.store.get(this.key(studentId, skill)) ?? null;
  }

  async getSkillStatesForTopics(studentId: string, topics: Topic[]): Promise<SkillStateSnapshot[]> {
    return [...this.store.values()].filter(
      (s) => s.studentId === studentId && topics.includes(s.topic)
    );
  }
}

export const feature3Adapter: SkillIntelligenceAdapter & MockFeature3Adapter = new MockFeature3Adapter();
