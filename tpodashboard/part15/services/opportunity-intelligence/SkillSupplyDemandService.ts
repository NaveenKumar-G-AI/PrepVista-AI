/**
 * PrepVista AI — Part 15
 * Skill supply vs demand — Section 29/30. Demand = seats in currently open
 * drives requiring the skill. Supply = students (any status) carrying that
 * skill tag. `gap` is demand minus supply; negative means surplus.
 */

import type { RoleCoverage, SkillDemandSupply } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";

export class SkillSupplyDemandService {
  constructor(private readonly repo: PlacementDataRepository) {}

  async getSkillDemandSupply(asOf: string): Promise<SkillDemandSupply[]> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const [students, drives] = await Promise.all([this.repo.getStudents(asOf), this.repo.getActiveDrives(seasonId)]);

    const skills = new Set<string>();
    for (const d of drives) for (const s of d.requiredSkills) skills.add(s);
    for (const st of students) for (const s of st.skillTags) skills.add(s);

    return [...skills]
      .map((skill) => {
        const activeRoleDemand = drives.filter((d) => d.requiredSkills.includes(skill)).reduce((sum, d) => sum + d.seats, 0);
        const studentsMeetingThreshold = students.filter((s) => s.skillTags.includes(skill)).length;
        return { skill, activeRoleDemand, studentsMeetingThreshold, gap: activeRoleDemand - studentsMeetingThreshold };
      })
      .sort((a, b) => b.activeRoleDemand - a.activeRoleDemand);
  }

  /** Role-category coverage — Section 30. Categories come from whatever's configured on drives, not a hardcoded list. */
  async getRoleCoverage(asOf: string): Promise<RoleCoverage[]> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const [students, drives] = await Promise.all([this.repo.getStudents(asOf), this.repo.getActiveDrives(seasonId)]);
    const categories = new Set(drives.map((d) => d.roleCategory));

    return [...categories].map((roleCategory) => {
      const roleDrives = drives.filter((d) => d.roleCategory === roleCategory);
      const opportunityCount = roleDrives.reduce((sum, d) => sum + d.seats, 0);
      const requiredSkillsUnion = new Set(roleDrives.flatMap((d) => d.requiredSkills));
      const studentReadyCount = students.filter(
        (s) => s.status !== "PLACED" && s.readinessScore >= 70 && [...requiredSkillsUnion].some((sk) => s.skillTags.includes(sk))
      ).length;
      const coverageRatio = studentReadyCount > 0 ? opportunityCount / studentReadyCount : opportunityCount > 0 ? Infinity : 0;
      return { roleCategory, opportunityCount, studentReadyCount, coverageRatio: Number.isFinite(coverageRatio) ? Math.round(coverageRatio * 100) / 100 : coverageRatio, gap: studentReadyCount - opportunityCount };
    });
  }
}
