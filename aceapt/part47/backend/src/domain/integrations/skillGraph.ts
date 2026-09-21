/**
 * Port for Feature 45 - Skill Graph (Sections 40, 81).
 *
 * INTEGRATION: replace NullSkillGraphPort with an adapter that calls the
 * real Feature 45 service. Feature 47 only ever READS through this port
 * (Section 40: "Do NOT alter the global graph automatically").
 */
export interface SkillGraphPort {
  getPrerequisites(skillId: string): Promise<string[]>;
  getRelated(skillId: string): Promise<string[]>;
}

export class NullSkillGraphPort implements SkillGraphPort {
  async getPrerequisites(_skillId: string): Promise<string[]> {
    return [];
  }
  async getRelated(_skillId: string): Promise<string[]> {
    return [];
  }
}
