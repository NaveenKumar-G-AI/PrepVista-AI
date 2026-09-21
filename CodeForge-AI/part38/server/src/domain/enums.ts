/**
 * These are the enums the reporting layer is allowed to know about. Note
 * what's absent: there is no numeric "mastery score" anywhere in this
 * codebase. Feature 38 renders whatever discrete level the (fixture-backed)
 * Mastery Level System / Role Readiness Engine / Growth Tracking already
 * decided — see brief §2, "ABSOLUTE RULE — do not create a second
 * intelligence engine."
 *
 * MASTERY_LEVEL_VALUES below is the example scale from brief §18
 * (Foundational…Expert). No such enum was available to inspect, so this is
 * an explicit stand-in — wire this to CodeForge's real Mastery Level System
 * enum before shipping, and nowhere else in this codebase should need to
 * change (it's referenced only through this one export).
 */

export enum MasteryLevel {
  FOUNDATIONAL = "FOUNDATIONAL",
  DEVELOPING = "DEVELOPING",
  COMPETENT = "COMPETENT",
  PROFICIENT = "PROFICIENT",
  ADVANCED = "ADVANCED",
  EXPERT = "EXPERT",
}

export const MASTERY_LEVEL_ORDER: MasteryLevel[] = [
  MasteryLevel.FOUNDATIONAL,
  MasteryLevel.DEVELOPING,
  MasteryLevel.COMPETENT,
  MasteryLevel.PROFICIENT,
  MasteryLevel.ADVANCED,
  MasteryLevel.EXPERT,
];

export enum EvidenceState {
  OBSERVED = "OBSERVED",
  INFERRED = "INFERRED",
  ESTIMATED = "ESTIMATED",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  UNAVAILABLE = "UNAVAILABLE",
}

export enum SkillTrend {
  UP = "UP",
  STABLE = "STABLE",
  DOWN = "DOWN",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
}

export enum EvidenceStrength {
  STRONG = "STRONG",
  MODERATE = "MODERATE",
  LIMITED = "LIMITED",
  NONE = "NONE",
}

export enum GapStatus {
  ON_TRACK = "ON_TRACK",
  GAP = "GAP",
  BLOCKING_GAP = "BLOCKING_GAP",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

export enum RoleReadinessLevel {
  READY = "READY",
  NEAR_READY = "NEAR_READY",
  DEVELOPING = "DEVELOPING",
  NOT_READY = "NOT_READY",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
}

/** Report generation lifecycle — brief §12. Terminal states: COMPLETED, FAILED, CANCELLED. */
export enum ReportLifecycleStatus {
  REQUESTED = "REQUESTED",
  QUEUED = "QUEUED",
  GENERATING = "GENERATING",
  VALIDATING = "VALIDATING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/** Freshness relative to current source data — brief §42-43. Distinct from lifecycle status. */
export enum ReportFreshnessStatus {
  UP_TO_DATE = "UP_TO_DATE",
  STALE = "STALE",
  GENERATING = "GENERATING",
  FAILED = "FAILED",
  UNAVAILABLE = "UNAVAILABLE",
}

export enum UserRole {
  STUDENT = "STUDENT",
  TRAINER = "TRAINER",
  TPO = "TPO",
  INSTITUTION_ADMIN = "INSTITUTION_ADMIN",
  ADMIN = "ADMIN",
}

export enum ReportType {
  STUDENT_TECHNICAL_MASTERY = "STUDENT_TECHNICAL_MASTERY",
}

export enum ReportAuditAction {
  GENERATED = "GENERATED",
  VIEWED = "VIEWED",
  DOWNLOADED = "DOWNLOADED",
  SHARED = "SHARED",
  REVOKED = "REVOKED",
  REGENERATED = "REGENERATED",
}

/**
 * Report TEMPLATE/schema version — separate from source-data version
 * (brief §11). Bump this when the report's shape/content model changes,
 * not when a student's underlying skill data changes.
 */
export const REPORT_SCHEMA_VERSION = process.env.REPORT_SCHEMA_VERSION ?? "1.0.0";
