// services/priority/priorityEngine.ts
//
// Deterministic, explainable priority calculation (spec section 12).
// Priority is NOT the same as severity: severity is a property of the
// signal TYPE (how bad this kind of problem is in general), priority is
// contextual (how urgent is THIS instance, right now, given who and how
// many people it affects).
//
// This is intentionally plain weighted arithmetic, not a model — section
// 50 is explicit that an LLM must never be the numeric anomaly/priority
// engine. Every number here can be read straight off the formula, and
// the breakdown is returned alongside the score so a UI (or Part 12) can
// show its work rather than asserting a number ("every priority must be
// explainable", section 47/57).

import type { Confidence, Severity } from '../signals/types';

const SEVERITY_BASE: Record<Severity, number> = {
  CRITICAL: 90,
  HIGH: 70,
  MEDIUM: 45,
  LOW: 20,
  INFO: 5,
};

const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = {
  HIGH_CONFIDENCE: 1.0,
  MEDIUM_CONFIDENCE: 0.85,
  LOW_CONFIDENCE: 0.6,
};

export interface PriorityInput {
  baseSeverity: Severity;
  hoursUntilDeadline: number | null; // null = no deadline pressure
  studentsAffected: number;
  confidence: Confidence;
  institutionalSignificance?: number; // 0..1, optional extra weight (management-tier signals)
}

export interface PriorityBreakdown {
  severityScore: number;
  urgencyScore: number;
  impactScore: number;
  confidenceMultiplier: number;
  significanceBonus: number;
  rawScore: number;
  priorityScore: number; // 0-100, clamped
  priorityBucket: Severity;
}

/** Urgency rises sharply as a deadline nears; a distant deadline barely
 * moves it — mirrors the spec's own "2 days vs 4 hours" example. */
function urgencyScore(hoursUntilDeadline: number | null): number {
  if (hoursUntilDeadline === null) return 0;
  if (hoursUntilDeadline <= 0) return 30; // overdue
  if (hoursUntilDeadline <= 4) return 28;
  if (hoursUntilDeadline <= 24) return 20;
  if (hoursUntilDeadline <= 48) return 12;
  if (hoursUntilDeadline <= 168) return 5;
  return 0;
}

/** Impact scales with affected students but with diminishing returns —
 * 400 students should read as "much worse" than 3, but not linearly
 * 130x worse on a 0-100 scale, or the score stops being meaningful. */
function impactScore(studentsAffected: number): number {
  if (studentsAffected <= 0) return 0;
  const capped = Math.min(studentsAffected, 2000);
  return Math.min(25, Math.round((Math.log10(capped + 1) / Math.log10(2001)) * 25));
}

function bucketFromScore(score: number): Severity {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  if (score >= 15) return 'LOW';
  return 'INFO';
}

export function calculatePriority(input: PriorityInput): PriorityBreakdown {
  const severityScore = SEVERITY_BASE[input.baseSeverity];
  const urgency = urgencyScore(input.hoursUntilDeadline);
  const impact = impactScore(input.studentsAffected);
  const confidenceMultiplier = CONFIDENCE_MULTIPLIER[input.confidence];
  const significanceBonus = Math.round((input.institutionalSignificance ?? 0) * 10);

  // Severity carries the most weight (0.5) by design: a CRITICAL-class
  // problem with a distant deadline should usually still outrank a
  // MEDIUM-class problem with an imminent one — but urgency + impact can
  // still push a signal up a full bucket or two, which is exactly the
  // spec's own worked example (section 12).
  const rawScore = (severityScore * 0.5 + urgency + impact + significanceBonus) * confidenceMultiplier;
  const priorityScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    severityScore,
    urgencyScore: urgency,
    impactScore: impact,
    confidenceMultiplier,
    significanceBonus,
    rawScore,
    priorityScore,
    priorityBucket: bucketFromScore(priorityScore),
  };
}
