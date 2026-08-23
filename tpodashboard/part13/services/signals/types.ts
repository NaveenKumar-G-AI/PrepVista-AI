// services/signals/types.ts
//
// Part 13 — Proactive Placement Intelligence Engine
// Core domain types. Everything else in this module is built on these.
//
// Integration note: field names follow the conceptual model in the Part 13
// spec (section 9), camelCase to match TS convention. Map 1:1 onto your
// real schema — see prisma/part13_proactive_signals.prisma for a worked
// mapping (snake_case columns via @map, if that's your Postgres convention).

export type SignalCategory =
  | 'APPLICATION'
  | 'INTERVIEW'
  | 'OFFER'
  | 'JOINING'
  | 'TRAINING'
  | 'ASSESSMENT'
  | 'READINESS'
  | 'INTERVENTION'
  | 'DRIVE'
  | 'COMPANY_RELATIONSHIP'
  | 'COMMUNICATION'
  | 'DATA_QUALITY'
  | 'PLACEMENT'
  | 'MANAGEMENT'
  | 'SYSTEM';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Severity only ever moves up while a signal is open — via escalation
 * (time) or a dedup refresh finding worse evidence. Resolution/dismissal
 * is the only way it stops mattering. This helper is the single place
 * that enforces "never silently downgrade an open signal." */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export type SignalStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'SNOOZED'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'DISMISSED';

export type Confidence = 'HIGH_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'LOW_CONFIDENCE';

export type Actionability =
  | 'INFORMATIONAL'
  | 'MONITOR'
  | 'REVIEW'
  | 'ACTION_RECOMMENDED'
  | 'ACTION_REQUIRED';

export type Audience = 'TPO' | 'STUDENT' | 'MANAGEMENT';
// Deliberately excludes 'RECRUITER' — recruiters never get PrepVista
// access or PrepVista-generated intelligence (spec sections 1 & 31).

export type Polarity = 'RISK' | 'POSITIVE' | 'NEUTRAL';

export interface Evidence {
  [key: string]: string | number | boolean | null | undefined;
}

export interface EvidenceMeta {
  /** ISO timestamp of the underlying data this evidence was computed from. */
  dataAsOf: string;
  /** true once dataAsOf is older than the signal's freshness budget. */
  isStale: boolean;
}

export interface RecommendedAction {
  type: string; // e.g. 'REVIEW_STUDENT_LIST', 'PREPARE_STUDENT_MESSAGE'
  label: string; // human-facing button label, e.g. "Review the 23 high-readiness students"
  requiresConfirmation: boolean; // Part 13 never executes sensitive actions itself (section 59)
  targetQuery?: Record<string, unknown>; // structured filter Part 14 can execute
  reason?: string;
}

export interface UpdateHistoryEntry {
  at: string;
  note: string;
}

export interface EscalationHistoryEntry {
  at: string;
  from: Severity;
  to: Severity;
  reason: string;
}

export interface ProactiveSignal {
  id: string;
  institutionId: string;
  seasonId: string;
  signalType: string; // key into SIGNAL_REGISTRY
  category: SignalCategory;
  polarity: Polarity;
  severity: Severity;
  priorityScore: number; // 0-100, see priorityEngine
  priorityBucket: Severity;
  status: SignalStatus;
  confidence: Confidence;
  actionability: Actionability;

  title: string;
  summary: string; // "why it matters" — concrete, never vague (section 48)
  entityType: string; // 'DRIVE' | 'STUDENT' | 'OFFER' | 'COMPANY' | 'DEPARTMENT' | ...
  entityId: string;
  departmentTag?: string; // used for clustering (section 54)

  evidence: Evidence;
  evidenceMeta: EvidenceMeta;
  recommendedAction?: RecommendedAction;

  audiences: Audience[]; // who is eligible to see this (role-based delivery, section 45)
  clusterId?: string;

  dedupKey: string;
  studentsAffected?: number;

  detectedAt: string;
  lastUpdatedAt: string;
  expiresAt?: string; // derived from hoursUntilDeadline at detection time
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionEvidence?: string;
  snoozedUntil?: string;
  dismissedAt?: string;

  escalationHistory: EscalationHistoryEntry[];
  updateHistory: UpdateHistoryEntry[];

  createdAt: string;
}

export interface SignalCandidate {
  // What a detector produces. The engine (dedup + priority + persistence)
  // turns this into a ProactiveSignal — detectors never write directly
  // (section 65: Database/events -> Signal engine -> Verified signal -> AI explanation).
  institutionId: string;
  seasonId: string;
  signalType: string;
  category: SignalCategory;
  polarity: Polarity;
  entityType: string;
  entityId: string;
  departmentTag?: string;
  title: string;
  summary: string;
  evidence: Evidence;
  evidenceMeta: EvidenceMeta;
  confidence: Confidence;
  studentsAffected?: number;
  hoursUntilDeadline?: number | null;
  institutionalSignificance?: number; // 0..1, optional weight for management-tier impact
  recommendedAction?: RecommendedAction;
  audiences: Audience[];
  baseSeverity?: Severity; // override the registry default if the detector knows better
}

export interface NotificationIntent {
  // The contract Part 9 consumes. Part 13 never sends anything itself
  // (section 70) — this is the whole interface between the two modules.
  id: string;
  institutionId: string;
  audience: Audience;
  recipientIds: string[]; // resolved by Part 9 from role + institution
  signalId?: string;
  kind: 'SIGNAL' | 'DAILY_BRIEFING' | 'END_OF_DAY_BRIEFING' | 'WEEKLY_INTELLIGENCE' | 'MANAGEMENT_BRIEFING';
  title: string;
  body: string;
  severity?: Severity;
  createdAt: string;
}
