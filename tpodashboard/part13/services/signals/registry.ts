// services/signals/registry.ts
//
// Section 5's signal registry, made concrete. Every signal type PrepVista
// can raise is declared here with its full policy — severity, audience,
// dedup fields, cooldown, escalation ladder, evidence freshness budget —
// whether or not a detector ships for it yet in this bundle.
//
// `implemented: true` means a real detector exists in modules/proactive/
// detectors/ in THIS delivery. `implemented: false` means the policy is
// fully specified and ready — write the detector against DataSourcePort
// and it slots straight in, nothing else needs to change.

import type { Actionability, Audience, SignalCategory, Severity } from './types';

export interface EscalationStep {
  afterHours: number;
  escalateTo: Severity;
}

export interface CooldownPolicy {
  // Minimum hours between re-NOTIFYING for the same open signal. The
  // signal record itself is always deduplicated/updated in place
  // (section 15) regardless of cooldown — cooldown only throttles how
  // often Part 9 is asked to notify about it again (section 16).
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  INFO: number;
}

export interface SignalTypeDefinition {
  signalType: string;
  category: SignalCategory;
  defaultSeverity: Severity;
  defaultAudiences: Audience[];
  defaultActionability: Actionability;
  cooldown: CooldownPolicy;
  escalation: EscalationStep[]; // ordered by afterHours; escalationEngine walks these
  evidenceFreshnessBudgetMinutes: number;
  description: string;
  implemented: boolean;
}

const step = (afterHours: number, escalateTo: Severity): EscalationStep => ({ afterHours, escalateTo });

const STANDARD_COOLDOWN: CooldownPolicy = { CRITICAL: 2, HIGH: 4, MEDIUM: 6, INFO: 12 };
const SLOW_COOLDOWN: CooldownPolicy = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, INFO: 48 };

export const SIGNAL_REGISTRY: Record<string, SignalTypeDefinition> = {
  // ---------------------------------------------------------------- APPLICATION
  APPLICATION_ELIGIBLE_NOT_APPLIED: {
    signalType: 'APPLICATION_ELIGIBLE_NOT_APPLIED',
    category: 'APPLICATION',
    defaultSeverity: 'HIGH',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(6, 'HIGH'), step(24, 'CRITICAL')],
    evidenceFreshnessBudgetMinutes: 30,
    description: 'Eligible students have not applied and the drive deadline is approaching.',
    implemented: true,
  },
  APPLICATION_LOW_RATE: {
    signalType: 'APPLICATION_LOW_RATE',
    category: 'APPLICATION',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(12, 'HIGH')],
    evidenceFreshnessBudgetMinutes: 60,
    description: 'Application rate for a drive is notably below the institution baseline.',
    implemented: false,
  },
  APPLICATION_RATE_IMPROVED: {
    signalType: 'APPLICATION_RATE_IMPROVED',
    category: 'APPLICATION',
    defaultSeverity: 'INFO',
    defaultAudiences: ['TPO', 'MANAGEMENT'],
    defaultActionability: 'INFORMATIONAL',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Positive: sustained improvement in application conversion.',
    implemented: true,
  },

  // ------------------------------------------------------------------ INTERVIEW
  INTERVIEW_RESULT_PENDING: {
    signalType: 'INTERVIEW_RESULT_PENDING',
    category: 'INTERVIEW',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(12, 'MEDIUM'), step(24, 'HIGH'), step(48, 'CRITICAL')],
    evidenceFreshnessBudgetMinutes: 30,
    description: 'Interview results have been outstanding longer than the configured threshold.',
    implemented: true,
  },
  INTERVIEW_NO_SHOW: {
    signalType: 'INTERVIEW_NO_SHOW',
    category: 'INTERVIEW',
    defaultSeverity: 'LOW',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: STANDARD_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 60,
    description: 'A scheduled interview candidate did not attend.',
    implemented: false,
  },

  // ---------------------------------------------------------------------- OFFER
  OFFER_DEADLINE_APPROACHING: {
    signalType: 'OFFER_DEADLINE_APPROACHING',
    category: 'OFFER',
    defaultSeverity: 'HIGH',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(12, 'CRITICAL')],
    evidenceFreshnessBudgetMinutes: 30,
    description: 'One or more offers expire soon without a recorded acceptance.',
    implemented: true,
  },
  OFFER_VERIFICATION_MISSING: {
    signalType: 'OFFER_VERIFICATION_MISSING',
    category: 'OFFER',
    defaultSeverity: 'LOW',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(72, 'MEDIUM')],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'An offer is missing supporting documentation/verification.',
    implemented: false,
  },

  // -------------------------------------------------------------------- JOINING
  JOINING_CONFIRMATION_MISSING: {
    signalType: 'JOINING_CONFIRMATION_MISSING',
    category: 'JOINING',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(48, 'HIGH'), step(120, 'CRITICAL')],
    evidenceFreshnessBudgetMinutes: 60,
    description: 'Accepted offers with no joining confirmation on file.',
    implemented: true,
  },
  JOINING_DID_NOT_JOIN: {
    signalType: 'JOINING_DID_NOT_JOIN',
    category: 'JOINING',
    defaultSeverity: 'HIGH',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: STANDARD_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Joining date passed without a confirmed joining.',
    implemented: false,
  },

  // ------------------------------------------------------------------- TRAINING
  TRAINING_LOW_ATTENDANCE: {
    signalType: 'TRAINING_LOW_ATTENDANCE',
    category: 'TRAINING',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(168, 'HIGH')],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Students have fallen below the required training attendance threshold.',
    implemented: true,
  },
  TRAINING_COMPLETION_IMPROVED: {
    signalType: 'TRAINING_COMPLETION_IMPROVED',
    category: 'TRAINING',
    defaultSeverity: 'INFO',
    defaultAudiences: ['TPO', 'MANAGEMENT'],
    defaultActionability: 'INFORMATIONAL',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Positive: sustained improvement in training completion.',
    implemented: true,
  },

  // ----------------------------------------------------------------- ASSESSMENT
  ASSESSMENT_OVERDUE: {
    signalType: 'ASSESSMENT_OVERDUE',
    category: 'ASSESSMENT',
    defaultSeverity: 'LOW',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(168, 'MEDIUM')],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'A required post-training assessment is overdue.',
    implemented: false,
  },
  ASSESSMENT_REPEATED_FAILURE: {
    signalType: 'ASSESSMENT_REPEATED_FAILURE',
    category: 'ASSESSMENT',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'A student has failed the same assessment more than once — a candidate for a different kind of intervention than a first-time failure.',
    implemented: false,
  },

  // ------------------------------------------------------------------ READINESS
  READINESS_SIGNIFICANT_DECLINE: {
    signalType: 'READINESS_SIGNIFICANT_DECLINE',
    category: 'READINESS',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(168, 'HIGH')],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'A meaningful, sustained readiness decline across one or more students.',
    implemented: true,
  },
  READINESS_MILESTONE_REACHED: {
    signalType: 'READINESS_MILESTONE_REACHED',
    category: 'READINESS',
    defaultSeverity: 'INFO',
    defaultAudiences: ['TPO', 'MANAGEMENT'],
    defaultActionability: 'INFORMATIONAL',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Positive: students crossed the placement-ready threshold.',
    implemented: true,
  },

  // --------------------------------------------------------------- INTERVENTION
  INTERVENTION_OVERDUE: {
    signalType: 'INTERVENTION_OVERDUE',
    category: 'INTERVENTION',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(72, 'HIGH')],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'An assigned intervention has not been started within the expected window.',
    implemented: false,
  },
  INTERVENTION_INEFFECTIVE_AFTER_WINDOW: {
    signalType: 'INTERVENTION_INEFFECTIVE_AFTER_WINDOW',
    category: 'INTERVENTION',
    defaultSeverity: 'LOW',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description:
      'Students completed an intervention but post-assessment data shows no measurable improvement. Cautious framing only — never asserts the intervention failed (section 29).',
    implemented: false,
  },

  // ---------------------------------------------------------------------- DRIVE
  DRIVE_DEADLINE_APPROACHING: {
    signalType: 'DRIVE_DEADLINE_APPROACHING',
    category: 'DRIVE',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(6, 'HIGH')],
    evidenceFreshnessBudgetMinutes: 60,
    description: 'A drive-level deadline (not application-specific) is approaching — config/approval/requirements.',
    implemented: false,
  },

  // --------------------------------------------------------- COMPANY_RELATIONSHIP
  COMPANY_RELATIONSHIP_STALE: {
    signalType: 'COMPANY_RELATIONSHIP_STALE',
    category: 'COMPANY_RELATIONSHIP',
    defaultSeverity: 'LOW',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(720, 'MEDIUM')], // 30 more days quiet -> bump
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'A recruiter with a real hiring history has gone quiet for an extended period. TPO-side intelligence only — never delivered to the recruiter (section 31).',
    implemented: true,
  },

  // ------------------------------------------------------------- COMMUNICATION
  COMMUNICATION_CRITICAL_DELIVERY_FAILURE: {
    signalType: 'COMMUNICATION_CRITICAL_DELIVERY_FAILURE',
    category: 'COMMUNICATION',
    defaultSeverity: 'HIGH',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_REQUIRED',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(2, 'CRITICAL')],
    evidenceFreshnessBudgetMinutes: 15,
    description: 'A critical message failed to reach a large audience.',
    implemented: false,
  },

  // --------------------------------------------------------------- DATA_QUALITY
  DATA_QUALITY_UNVERIFIED_OUTCOME: {
    signalType: 'DATA_QUALITY_UNVERIFIED_OUTCOME',
    category: 'DATA_QUALITY',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'ACTION_RECOMMENDED',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(168, 'HIGH')],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Placement outcomes remain unverified past the normal verification lag.',
    implemented: true,
  },
  DATA_QUALITY_ORPHAN_RECORD: {
    signalType: 'DATA_QUALITY_ORPHAN_RECORD',
    category: 'DATA_QUALITY',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO'],
    defaultActionability: 'REVIEW',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'A record exists without its required parent (e.g. joining without offer, interview without application).',
    implemented: false,
  },

  // ------------------------------------------------------------------ PLACEMENT
  PLACEMENT_RATE_BEHIND_LAST_SEASON: {
    signalType: 'PLACEMENT_RATE_BEHIND_LAST_SEASON',
    category: 'PLACEMENT',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO', 'MANAGEMENT'],
    defaultActionability: 'MONITOR',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Placement outcome pace is behind the equivalent point in the previous season.',
    implemented: false,
  },

  // ----------------------------------------------------------------- MANAGEMENT
  MANAGEMENT_PLACEMENT_TARGET_GAP: {
    signalType: 'MANAGEMENT_PLACEMENT_TARGET_GAP',
    category: 'MANAGEMENT',
    defaultSeverity: 'MEDIUM',
    defaultAudiences: ['TPO', 'MANAGEMENT'],
    defaultActionability: 'MONITOR',
    cooldown: SLOW_COOLDOWN,
    escalation: [step(336, 'HIGH')], // two weeks unaddressed
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'Actual placement rate is meaningfully below target, with sufficient sample to be reliable.',
    implemented: true,
  },
  MANAGEMENT_RECRUITER_CONCENTRATION: {
    signalType: 'MANAGEMENT_RECRUITER_CONCENTRATION',
    category: 'MANAGEMENT',
    defaultSeverity: 'LOW',
    defaultAudiences: ['MANAGEMENT'],
    defaultActionability: 'MONITOR',
    cooldown: SLOW_COOLDOWN,
    escalation: [],
    evidenceFreshnessBudgetMinutes: 1440,
    description: 'A small number of companies account for a disproportionate share of placements.',
    implemented: false,
  },

  // ---------------------------------------------------------------------- SYSTEM
  SYSTEM_EVIDENCE_STALE: {
    signalType: 'SYSTEM_EVIDENCE_STALE',
    category: 'SYSTEM',
    defaultSeverity: 'LOW',
    defaultAudiences: ['TPO'],
    defaultActionability: 'MONITOR',
    cooldown: STANDARD_COOLDOWN,
    escalation: [step(4, 'MEDIUM')],
    evidenceFreshnessBudgetMinutes: 120,
    description: 'A signal\u2019s underlying data source has not refreshed within its freshness budget — the pipeline feeding it may be stuck.',
    implemented: true,
  },
};

export function getSignalDefinition(signalType: string): SignalTypeDefinition | undefined {
  return SIGNAL_REGISTRY[signalType];
}

export function implementedSignalTypes(): string[] {
  return Object.values(SIGNAL_REGISTRY)
    .filter((d) => d.implemented)
    .map((d) => d.signalType);
}

export function registeredNotImplementedSignalTypes(): string[] {
  return Object.values(SIGNAL_REGISTRY)
    .filter((d) => !d.implemented)
    .map((d) => d.signalType);
}
