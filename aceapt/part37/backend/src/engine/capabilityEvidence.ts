import {
  CapabilityEvidenceLabel,
  CapabilityEvidenceResult,
  ConfidenceLevel,
  EvidenceClass,
  EvidenceItem,
  FreshnessState,
  evidenceClassRank,
} from '../types/domain';
import { classifyEvidence } from './evidenceClassification';
import { computeFreshness } from './freshness';

interface ClassifiedItem {
  item: EvidenceItem;
  cls: EvidenceClass;
  freshness: FreshnessState;
}

const KNOWLEDGE_LIKE_SOURCES: EvidenceItem['sourceType'][] = ['ASSESSMENT', 'CERTIFICATE', 'TRAINING'];
const APPLIED_LIKE_SOURCES: EvidenceItem['sourceType'][] = ['SIMULATION', 'CODING_TEST', 'PROJECT', 'INTERVIEW'];

/** A gap of this many points (on a 0-100 scale) between theory and practice is treated as a real conflict. */
const CONFLICT_SCORE_GAP_THRESHOLD = 30;

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Looks across evidence for a single capability and flags when theoretical
 * performance (assessments, certificates, training) is considerably
 * stronger than practical performance (simulations, coding tests, projects,
 * interviews). This mirrors the "your theoretical performance is
 * considerably stronger than your practical performance" case from the
 * product brief — it never says the student is dishonest, only that the
 * two signal sets disagree.
 */
function detectConflict(classified: ClassifiedItem[]): { hasConflict: boolean; explanation: string | null } {
  const scored = classified.filter(
    (c): c is ClassifiedItem & { item: EvidenceItem & { score: number } } => c.item.score !== null
  );
  if (scored.length < 2) return { hasConflict: false, explanation: null };

  const knowledgeScores = scored.filter((s) => KNOWLEDGE_LIKE_SOURCES.includes(s.item.sourceType)).map((s) => s.item.score);
  const appliedScores = scored.filter((s) => APPLIED_LIKE_SOURCES.includes(s.item.sourceType)).map((s) => s.item.score);

  if (knowledgeScores.length === 0 || appliedScores.length === 0) {
    return { hasConflict: false, explanation: null };
  }

  const avgKnowledge = average(knowledgeScores);
  const avgApplied = average(appliedScores);

  if (avgKnowledge - avgApplied >= CONFLICT_SCORE_GAP_THRESHOLD) {
    return {
      hasConflict: true,
      explanation: `Theoretical performance (avg ${Math.round(avgKnowledge)}) is considerably stronger than practical performance (avg ${Math.round(
        avgApplied
      )}). A realistic applied simulation would help confirm this capability.`,
    };
  }

  return { hasConflict: false, explanation: null };
}

function classToLabel(cls: EvidenceClass, hasConflict: boolean): CapabilityEvidenceLabel {
  // Conflicting evidence is never presented as "strong", even if one source alone looks strong —
  // the whole point is that a single high score doesn't settle the question when another source disagrees.
  if (hasConflict) return 'DEVELOPING';

  const rank = evidenceClassRank(cls);
  if (rank <= evidenceClassRank('SELF_REPORTED')) return 'LIMITED';
  if (rank <= evidenceClassRank('PRACTICE')) return 'DEVELOPING';
  return 'STRONG'; // DEMONSTRATED, VALIDATED, REAL_WORLD
}

function computeConfidence(
  independentSourceCount: number,
  freshness: FreshnessState | null,
  hasConflict: boolean
): ConfidenceLevel {
  if (hasConflict) return 'LOW';
  const isFresh = freshness === 'RECENT' || freshness === 'AGING';
  if (independentSourceCount >= 3 && isFresh) return 'HIGH';
  if (independentSourceCount >= 2) return 'MEDIUM';
  return 'LOW';
}

function buildReasons(
  pool: ClassifiedItem[],
  bestClass: EvidenceClass,
  independentSourceCount: number,
  freshness: FreshnessState | null,
  conflict: { hasConflict: boolean; explanation: string | null }
): string[] {
  const reasons: string[] = [];

  if (conflict.hasConflict && conflict.explanation) {
    reasons.push(conflict.explanation);
    return reasons;
  }

  const sourceLabel = independentSourceCount === 1 ? 'source' : 'independent sources';
  reasons.push(`${independentSourceCount} ${sourceLabel} of evidence, strongest at "${bestClass.replace('_', ' ').toLowerCase()}" level.`);

  if (freshness === 'STALE' || freshness === 'REVALIDATION_RECOMMENDED') {
    reasons.push('The strongest evidence is aging — revalidating would strengthen confidence.');
  }

  const sourceTypes = Array.from(new Set(pool.map((p) => p.item.sourceType)));
  if (sourceTypes.length > 0) {
    reasons.push(`Drawn from: ${sourceTypes.map((s) => s.toLowerCase().replace('_', ' ')).join(', ')}.`);
  }

  return reasons;
}

function unknownResult(capabilityId: string): CapabilityEvidenceResult {
  return {
    capabilityId,
    label: 'UNKNOWN',
    achievedClass: null,
    confidence: 'LOW',
    independentSourceCount: 0,
    freshestEvidenceDate: null,
    freshnessState: null,
    hasConflict: false,
    conflictExplanation: null,
    contributingEvidenceIds: [],
    reasons: ['No evidence has been recorded for this capability yet.'],
  };
}

/**
 * Aggregates every evidence item for one capability into a single,
 * explainable result. This is the heart of "what can this student actually
 * prove": it never simply averages scores or counts activity — it looks at
 * what class of evidence is currently fresh enough to count, whether
 * multiple sources agree, and how confident that picture is.
 */
export function aggregateCapabilityEvidence(
  capabilityId: string,
  allEvidence: EvidenceItem[],
  freshnessWindowDays: number,
  now: Date = new Date()
): CapabilityEvidenceResult {
  const items = allEvidence.filter((e) => e.capabilityId === capabilityId);
  if (items.length === 0) return unknownResult(capabilityId);

  const classified: ClassifiedItem[] = items.map((item) => ({
    item,
    cls: classifyEvidence(item),
    freshness: computeFreshness(item.occurredAt, freshnessWindowDays, now),
  }));

  // Evidence that has gone fully stale ("revalidation recommended") no longer counts toward the
  // *current* achieved class, but everything is retained for transparency and source counting.
  const usable = classified.filter((c) => c.freshness !== 'REVALIDATION_RECOMMENDED');
  const pool = usable.length > 0 ? usable : classified;

  const bestEntry = pool.reduce((best, c) => (evidenceClassRank(c.cls) > evidenceClassRank(best.cls) ? c : best), pool[0]);
  const bestClass = bestEntry.cls;

  const conflict = detectConflict(classified);
  const independentSourceCount = new Set(items.map((i) => i.sourceType)).size;
  const freshestEvidenceDate = items.map((i) => i.occurredAt).sort().reverse()[0] ?? null;
  const freshnessState =
    pool
      .slice()
      .sort((a, b) => evidenceClassRank(b.cls) - evidenceClassRank(a.cls))[0]?.freshness ?? null;

  const label = classToLabel(bestClass, conflict.hasConflict);
  const confidence = computeConfidence(independentSourceCount, freshnessState, conflict.hasConflict);
  const reasons = buildReasons(pool, bestClass, independentSourceCount, freshnessState, conflict);

  return {
    capabilityId,
    label,
    achievedClass: bestClass,
    confidence,
    independentSourceCount,
    freshestEvidenceDate,
    freshnessState,
    hasConflict: conflict.hasConflict,
    conflictExplanation: conflict.explanation,
    contributingEvidenceIds: pool.map((c) => c.item.id),
    reasons,
  };
}
