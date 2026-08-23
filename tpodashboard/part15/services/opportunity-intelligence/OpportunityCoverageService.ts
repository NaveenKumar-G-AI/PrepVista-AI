/**
 * PrepVista AI — Part 15
 * Opportunity Coverage — Section 28. Compares placement-ready-but-not-yet-placed
 * students against currently open drives they're actually eligible/matched for
 * (department eligibility + at least one required-skill overlap).
 */

import type { Drive, OpportunityCoverage, Student } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";

export const READY_THRESHOLD = 70; // readinessScore >= this AND not yet placed = "ready"

export function isReady(student: Student): boolean {
  return student.status !== "PLACED" && student.readinessScore >= READY_THRESHOLD;
}

export function matchesAnyDrive(student: Student, drives: Drive[]): boolean {
  return drives.some((d) => d.eligibleDepartmentIds.includes(student.departmentId) && d.requiredSkills.some((s) => student.skillTags.includes(s)));
}

export class OpportunityCoverageService {
  constructor(private readonly repo: PlacementDataRepository) {}

  async getCoverage(asOf: string): Promise<OpportunityCoverage> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const [students, drives] = await Promise.all([this.repo.getStudents(asOf), this.repo.getActiveDrives(seasonId)]);
    const ready = students.filter(isReady);
    const unmatched = ready.filter((s) => !matchesAnyDrive(s, drives));
    return {
      readyStudents: ready.length,
      matchedToActiveOpportunity: ready.length - unmatched.length,
      unmatched: unmatched.length,
      unmatchedStudentIds: unmatched.map((s) => s.id),
      asOf,
    };
  }
}
