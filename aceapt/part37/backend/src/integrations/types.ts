import { CapabilityRequirement, EvidenceItem, NextProofRecommendation, ReadinessGap, ValidationCatalogEntry } from '../types/domain';

/**
 * These interfaces are the seams where Feature 37 plugs into the rest of
 * ACEAPT. Nothing in `engine/`, `services/`, or `routes/` talks to Feature
 * 33/34/35/36 directly — everything goes through one of these, so swapping
 * a stub for a real internal client is a one-file change.
 *
 * Every method takes `tenantId` explicitly, even where a real implementation
 * might derive it from an internal auth context, so tenant isolation is
 * never accidentally dropped when this gets wired into a real client.
 *
 * No repository, no real ACEAPT codebase was available when this was built
 * (see root README), so each interface ships with the smallest honest
 * default implementation in `defaultAdapters.ts` — never fabricated data,
 * just an explicit "not wired up yet" behavior.
 */

/** Feature 34 — Career Trajectory: supplies the student's target role(s). */
export interface TrajectoryProvider {
  getTargetRoles(tenantId: string, studentId: string): Promise<Array<{ roleId: string; roleName: string; isPrimary: boolean }>>;
}

/**
 * Feature 33 — Opportunity Intelligence: supplies the capability
 * requirements for a specific opportunity/job, and (optionally) which
 * opportunities are worth checking readiness against for a role.
 */
export interface OpportunityProvider {
  getOpportunityRequirements(tenantId: string, opportunityId: string): Promise<{ title: string; requirements: CapabilityRequirement[] } | null>;
  getRecommendedOpportunityIds(tenantId: string, studentId: string, roleId: string): Promise<string[]>;
}

/**
 * Feature 35 — Outcome & Failure Analysis: supplies evidence derived from
 * real outcomes (e.g. an interview rejection that was analyzed into a
 * specific, named capability gap). Feature 37 treats this exactly like any
 * other evidence source — it never treats a rejection as blanket proof of
 * incompetence, only as whatever specific signal Feature 35 attached to it.
 */
export interface OutcomeAnalysisProvider {
  getOutcomeEvidence(tenantId: string, studentId: string): Promise<EvidenceItem[]>;
}

/**
 * Feature 36 — Next Best Action: consumes readiness gaps so it can decide
 * what the student should be nudged toward next. Feature 37 only reports
 * the gap and its recommended proof; Feature 36 owns sequencing/timing.
 */
export interface NextActionSink {
  notifyReadinessGap(
    tenantId: string,
    studentId: string,
    roleId: string,
    gap: ReadinessGap,
    recommendation: NextProofRecommendation | null
  ): Promise<void>;
}

/**
 * Not one of Features 33-36, but the same idea: the catalog of real,
 * launchable validation activities (simulations, coding tests, projects)
 * that the "next best proof" recommendation should point at. This almost
 * certainly already exists somewhere in ACEAPT's assessment/simulation
 * system — this interface is how Feature 37 asks it "what could this
 * student go do to prove capability X?" without duplicating that catalog.
 */
export interface ValidationCatalogProvider {
  getCatalogForRole(tenantId: string, roleId: string, requirements: CapabilityRequirement[]): Promise<ValidationCatalogEntry[]>;
}
