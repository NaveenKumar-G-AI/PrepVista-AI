// Placeholder adapters. Production ACEAPT already has a real database and
// real Feature 33-37 services — none of that exists in this environment, so
// these classes implement the same ports with in-memory Maps that start
// EMPTY by default (spec section 50, "No Fake Intelligence": production must
// never show fabricated skills/projects/scores).
//
// To connect this to the real system: write a class that implements
// PositioningDataSource against your actual Feature 37/33/34 services and
// your actual student/project/story tables, then use it instead of
// `dataSource` in src/routes/positioning.ts. Do the same for
// PositioningResultStore against your real database.

import { PositioningDataSource } from "../types/integrationPorts";
import { PositioningResultStore } from "./repository";
import {
  Capability,
  Opportunity,
  PositioningProfile,
  ProfessionalStory,
  ProfileMaterialsSnapshot,
  ProjectEvidence,
  TargetRole,
} from "../types/domain";

export interface DemoSeed {
  studentId: string;
  role: TargetRole;
  capabilities: Capability[];
  projects: ProjectEvidence[];
  stories: ProfessionalStory[];
  snapshot: ProfileMaterialsSnapshot;
}

class InMemoryPositioningDataSource implements PositioningDataSource {
  private capabilitiesByStudent = new Map<string, Capability[]>();
  private projectsByStudent = new Map<string, ProjectEvidence[]>();
  private storiesByStudent = new Map<string, ProfessionalStory[]>();
  private snapshotByStudent = new Map<string, ProfileMaterialsSnapshot>();
  private roles = new Map<string, TargetRole>();
  private opportunities = new Map<string, Opportunity>();

  async getCapabilities(studentId: string): Promise<Capability[]> {
    return this.capabilitiesByStudent.get(studentId) ?? [];
  }

  async getProjects(studentId: string): Promise<ProjectEvidence[]> {
    return this.projectsByStudent.get(studentId) ?? [];
  }

  async getStories(studentId: string): Promise<ProfessionalStory[]> {
    return this.storiesByStudent.get(studentId) ?? [];
  }

  async getProfileMaterialsSnapshot(studentId: string): Promise<ProfileMaterialsSnapshot> {
    return this.snapshotByStudent.get(studentId) ?? {};
  }

  async getRoleById(roleId: string): Promise<TargetRole | null> {
    return this.roles.get(roleId) ?? null;
  }

  async getTargetRole(_studentId: string): Promise<TargetRole | null> {
    // Placeholder for Feature 34 (career trajectory). Real implementation
    // should return whatever role the student has currently targeted.
    return null;
  }

  async getOpportunity(opportunityId: string): Promise<Opportunity | null> {
    return this.opportunities.get(opportunityId) ?? null;
  }

  /**
   * Development-only helper. Never call this against a production data
   * source — it exists so `npm run seed` can populate obviously-fake demo
   * data for local preview (spec section 50 permits fixtures for dev/test
   * only).
   */
  async __seedDemoData(seed: DemoSeed): Promise<void> {
    this.roles.set(seed.role.id, seed.role);
    this.capabilitiesByStudent.set(seed.studentId, seed.capabilities);
    this.projectsByStudent.set(seed.studentId, seed.projects);
    this.storiesByStudent.set(seed.studentId, seed.stories);
    this.snapshotByStudent.set(seed.studentId, seed.snapshot);
  }
}

class InMemoryPositioningResultStore implements PositioningResultStore {
  private history = new Map<string, PositioningProfile[]>();

  private key(studentId: string, roleId: string, opportunityId?: string): string {
    return `${studentId}:${roleId}:${opportunityId ?? "-"}`;
  }

  async getLatest(studentId: string, roleId: string, opportunityId?: string): Promise<PositioningProfile | null> {
    const list = this.history.get(this.key(studentId, roleId, opportunityId));
    return list && list.length > 0 ? list[list.length - 1] : null;
  }

  async save(profile: PositioningProfile): Promise<void> {
    const k = this.key(profile.studentId, profile.targetRoleId, profile.opportunityId);
    const list = this.history.get(k) ?? [];
    list.push(profile);
    this.history.set(k, list);
  }

  async getHistory(studentId: string, roleId: string): Promise<PositioningProfile[]> {
    return this.history.get(this.key(studentId, roleId)) ?? [];
  }
}

export const dataSource = new InMemoryPositioningDataSource();
export const resultStore = new InMemoryPositioningResultStore();
