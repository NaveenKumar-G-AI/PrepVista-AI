import { SkillEvidence, ProblemSignal, Confidence, Priority } from '../types';
import { Feature6Client } from './integrations/Feature6Client';
import {
  PRIORITY_WEIGHTS,
  PRIORITY_THRESHOLDS,
  CATEGORY_READINESS_WEIGHT,
  DEFAULT_READINESS_WEIGHT,
} from '../config/priorityWeights';

export interface ScoredSignal extends ProblemSignal {
  priority_score: number;
  priority: Priority;
}

function clampFrequency(ev: SkillEvidence): number {
  return Math.min(100, ev.attempts * 6);
}

// ============================================================================
// ProblemDetectionService — §5 / §33
// Deterministic, rule-based translation of raw Feature 6 evidence into typed
// problem signals. AI never touches this layer (§39).
// ============================================================================
export class ProblemDetectionService {
  static detect(evidenceList: SkillEvidence[]): ProblemSignal[] {
    const signals: ProblemSignal[] = [];

    for (const ev of evidenceList) {
      const readinessRelevance = CATEGORY_READINESS_WEIGHT[ev.category] ?? DEFAULT_READINESS_WEIGHT;

      // §17 REGRESSION — a previously strong skill has slipped. Takes
      // priority over other framing for this skill.
      if (ev.historical_peak_accuracy !== undefined && ev.historical_peak_accuracy - ev.accuracy >= 15) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'REGRESSION',
          severity: Math.min(100, ev.historical_peak_accuracy - ev.accuracy),
          frequency: 70,
          readiness_relevance: readinessRelevance,
          improvement_opportunity: ev.historical_peak_accuracy - ev.accuracy,
          confidence: ev.attempts >= 8 ? Confidence.HIGH : Confidence.MEDIUM,
          details: `Previously ${ev.historical_peak_accuracy}% accuracy, now ${ev.accuracy}%.`,
        });
        continue;
      }

      // §5 LEARN — genuine concept gap.
      if (ev.concept_mastery < 55) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'CONCEPT_GAP',
          severity: 100 - ev.concept_mastery,
          frequency: clampFrequency(ev),
          readiness_relevance: readinessRelevance,
          improvement_opportunity: 100 - ev.concept_mastery,
          confidence: ev.attempts >= 5 ? Confidence.HIGH : Confidence.MEDIUM,
          details: `Concept mastery is ${ev.concept_mastery}%, below the reliability threshold.`,
        });
        continue;
      }

      // §5 REVISE — knowledge present but unstable.
      if (ev.concept_mastery >= 55 && ev.accuracy < 60) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'UNSTABLE_KNOWLEDGE',
          severity: 100 - ev.accuracy,
          frequency: clampFrequency(ev),
          readiness_relevance: readinessRelevance,
          improvement_opportunity: 100 - ev.accuracy,
          confidence: Confidence.MEDIUM,
          details: `Concepts are understood (${ev.concept_mastery}% mastery) but accuracy (${ev.accuracy}%) is still shaky.`,
        });
        continue;
      }

      // §5 ERROR_REPAIR — a specific recurring error pattern.
      if (ev.error_tags.length > 0 && ev.accuracy < 85) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'ERROR_PATTERN',
          severity: Math.min(100, ev.error_tags.length * 20 + (100 - ev.accuracy) * 0.4),
          frequency: clampFrequency(ev),
          readiness_relevance: readinessRelevance,
          improvement_opportunity: 100 - ev.accuracy,
          confidence: ev.attempts >= 6 ? Confidence.HIGH : Confidence.MEDIUM,
          details: `A recurring pattern shows up in your errors: ${ev.error_tags.join(', ')}.`,
        });
      }

      // §5 TIMED_PRACTICE — strong accuracy but slow, or drops under time pressure.
      const overTime = ev.avg_solving_time_sec / Math.max(1, ev.target_solving_time_sec);
      const timedDrop =
        ev.untimed_accuracy !== undefined && ev.timed_accuracy !== undefined
          ? ev.untimed_accuracy - ev.timed_accuracy
          : 0;
      if (ev.accuracy >= 70 && (overTime >= 1.2 || timedDrop >= 12)) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'SPEED_GAP',
          severity: Math.min(100, (overTime - 1) * 150 + timedDrop * 2),
          frequency: clampFrequency(ev),
          readiness_relevance: readinessRelevance,
          improvement_opportunity: Math.min(100, Math.max(0, overTime - 1) * 150),
          confidence: ev.attempts >= 5 ? Confidence.HIGH : Confidence.MEDIUM,
          details: `Averaging ${ev.avg_solving_time_sec}s against a ${ev.target_solving_time_sec}s target${
            timedDrop > 0 ? `, and accuracy drops ${timedDrop} points once a timer is running` : ''
          }.`,
        });
      }

      // §5 MIXED_PRACTICE — isolated-topic performance good, mixed weak.
      if (ev.mixed_topic_accuracy !== undefined && ev.accuracy - ev.mixed_topic_accuracy >= 12) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'MIXED_PERFORMANCE_GAP',
          severity: ev.accuracy - ev.mixed_topic_accuracy,
          frequency: clampFrequency(ev),
          readiness_relevance: readinessRelevance,
          improvement_opportunity: ev.accuracy - ev.mixed_topic_accuracy,
          confidence: Confidence.MEDIUM,
          details: `${ev.accuracy}% accuracy in isolation vs ${ev.mixed_topic_accuracy}% once mixed with other topics.`,
        });
      }

      // §5 / §15 STABLE / MASTERED — flagged so the priority engine actively
      // de-prioritizes it instead of just staying silent about it.
      if (ev.concept_mastery >= 80 && ev.accuracy >= 85 && overTime < 1.05) {
        signals.push({
          skill_id: ev.skill_id,
          skill_name: ev.skill_name,
          category: ev.category,
          problem_type: 'STABLE_STRENGTH',
          severity: 5,
          frequency: 10,
          readiness_relevance: readinessRelevance,
          improvement_opportunity: 5,
          confidence: Confidence.HIGH,
          details: `Consistently strong: ${ev.accuracy}% accuracy, solving on pace.`,
        });
      }
    }

    return signals;
  }
}

// ============================================================================
// PriorityEngine — §6
// score = severity·w1 + frequency·w2 + readiness_relevance·w3 + improvement_opportunity·w4
// Weights live in config/priorityWeights.ts so the formula stays tunable
// ("configurable and explainable" — §6) without touching this logic.
// ============================================================================
export class PriorityEngine {
  static score(signals: ProblemSignal[]): ScoredSignal[] {
    return signals
      .map((s) => {
        const raw =
          s.severity * PRIORITY_WEIGHTS.severity +
          s.frequency * PRIORITY_WEIGHTS.frequency +
          s.readiness_relevance * PRIORITY_WEIGHTS.readinessRelevance +
          s.improvement_opportunity * PRIORITY_WEIGHTS.improvementOpportunity;

        return {
          ...s,
          priority_score: Math.round(raw * 10) / 10,
          priority: bucketize(raw, s.problem_type),
        };
      })
      .sort((a, b) => b.priority_score - a.priority_score);
  }
}

function bucketize(score: number, problemType: string): Priority {
  // §15 — a stable strength should sort as low priority regardless of its
  // raw score, so it naturally lands in "maintain," not "top priority."
  if (problemType === 'STABLE_STRENGTH') return Priority.LOW;
  if (score >= PRIORITY_THRESHOLDS.CRITICAL) return Priority.CRITICAL;
  if (score >= PRIORITY_THRESHOLDS.HIGH) return Priority.HIGH;
  if (score >= PRIORITY_THRESHOLDS.MEDIUM) return Priority.MEDIUM;
  return Priority.LOW;
}

// ============================================================================
// RegressionDetectionService — §17
// Thin, dedicated surface over the same detection pass, so regressions can
// be queried/alerted on independently of where they land in the priority
// board (a regression can matter even at a middling priority score).
// ============================================================================
export class RegressionDetectionService {
  static async detect(studentId: string) {
    const evidence = await Feature6Client.getLatestEvidence(studentId);
    return ProblemDetectionService.detect(evidence).filter((s) => s.problem_type === 'REGRESSION');
  }
}
