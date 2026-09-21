/** Feature 45 (skill graph) integration seam. See ./README.md. */
export interface SkillSummary {
  skillId: string;
  name: string;
}

export interface SkillClient {
  getSkill(skillId: string): Promise<SkillSummary | null>;
}

export class StubSkillClient implements SkillClient {
  async getSkill(_skillId: string): Promise<SkillSummary | null> {
    return null;
  }
}
