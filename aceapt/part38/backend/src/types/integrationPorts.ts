// These interfaces describe the data Feature 38 needs FROM the features it
// depends on (spec sections 4-8). Nothing in this file talks to a real
// service — it only defines the contract. Once Features 33-37 exist as
// callable services in this codebase, write a class that implements
// PositioningDataSource against them and swap it in at the bottom of
// src/data/inMemoryRepository.ts (or wherever server.ts wires dependencies).
//
// This is expressed as one composed interface for simplicity. In a real
// multi-service backend you would likely split this back into five separate
// clients (one per feature) — the comments below mark where each piece comes
// from so that split stays easy.

import {
  Capability,
  Opportunity,
  ProfessionalStory,
  ProfileMaterialsSnapshot,
  ProjectEvidence,
  TargetRole,
} from "./domain";

export interface PositioningDataSource {
  // Feature 37: "What can I prove?"
  getCapabilities(studentId: string): Promise<Capability[]>;
  getProjects(studentId: string): Promise<ProjectEvidence[]>;

  // Feature 33: opportunity discovery.
  getOpportunity(opportunityId: string): Promise<Opportunity | null>;

  // Feature 34: career trajectory / target role.
  getRoleById(roleId: string): Promise<TargetRole | null>;
  getTargetRole(studentId: string): Promise<TargetRole | null>;

  // Story bank (feeds interview positioning + story engine).
  getStories(studentId: string): Promise<ProfessionalStory[]>;

  // Used by the consistency engine (spec section 42).
  getProfileMaterialsSnapshot(studentId: string): Promise<ProfileMaterialsSnapshot>;
}

// Feature 35: application/interview outcome analysis. Kept separate because
// nothing in the P0 pipeline calls it yet — see spec section 46,
// "Application Learning" — it's wired here so the seam exists.
export interface OutcomeSignal {
  applicationsCount: number;
  interviewsCount: number;
  positioningLabel: string;
}
export interface OutcomeService {
  getOutcomeSignal(studentId: string, positioningVersion: number): Promise<OutcomeSignal | null>;
}

// Feature 36: next-action recommendations. Feature 38 INFORMS Feature 36; it
// does not read from it (spec section 8). Implement this against the real
// Feature 36 intake once it exists.
export interface NextActionSink {
  reportPositioningWeakness(studentId: string, weakness: string): Promise<void>;
}
