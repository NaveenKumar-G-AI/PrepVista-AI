// Sections 8-9 — evidence types and evidence quality. Turns raw attempt
// history (practice/retention/transfer/simulation) into VerificationEvidence
// with a per-item quality profile, so "ten attempts on the same familiar
// pattern" does not carry the same weight as ten independent novel ones.

import type {
  VerificationEvidence, EvidenceQuality, EvidenceSummary, EvidenceType,
  NoveltyLevel, DifficultyLevel,
} from './types.js';
import type { RawAttemptRecord, NoveltyClassifierAdapter } from './ports.js';
import { clamp01 } from './util.js';

function recencyScore(occurredAt: string, halfLifeDays = 14): number {
  const ageMs = Date.now() - new Date(occurredAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return clamp01(Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays));
}

function noveltyScore(novelty: NoveltyLevel): number {
  switch (novelty) {
    case 'FAMILIAR': return 0.15;
    case 'RELATED': return 0.45;
    case 'NOVEL': return 0.75;
    case 'HIGHLY_NOVEL': return 1;
    default: return 0.3;
  }
}

function difficultyScore(difficulty: DifficultyLevel): number {
  switch (difficulty) {
    case 'EASY': return 0.25;
    case 'MEDIUM': return 0.55;
    case 'HARD': return 0.85;
    case 'TARGET': return 1;
    default: return 0.4;
  }
}

/** Credit peaks near the expected time; implausibly fast answers lose credit
 *  as a low-quality timed signal (more likely a guess than a demonstration
 *  of pace under pressure), and very slow ones lose credit for the opposite
 *  reason. */
function timePressureScore(timeTakenMs: number, expectedTimeMs: number): number {
  if (expectedTimeMs <= 0) return 0.5;
  const ratio = timeTakenMs / expectedTimeMs;
  if (ratio < 0.25) return 0.3;
  if (ratio <= 1.1) return 1;
  if (ratio <= 1.6) return 0.6;
  return 0.25;
}

/** Section 9's own example: an item only carries full independent weight the
 *  first time a given (capability, difficulty, novelty) combination is
 *  seen; repeats of an already-covered combination count for less. */
function independenceScores(evidences: { capability: string; difficulty: DifficultyLevel; novelty: NoveltyLevel }[]): number[] {
  const seen = new Map<string, number>();
  return evidences.map((e) => {
    const key = `${e.capability}|${e.difficulty}|${e.novelty}`;
    const priorCount = seen.get(key) ?? 0;
    seen.set(key, priorCount + 1);
    return clamp01(1 / (1 + priorCount));
  });
}

function diversityScore(all: { difficulty: DifficultyLevel; novelty: NoveltyLevel; evidenceType: EvidenceType }[]): number {
  if (!all.length) return 0;
  const distinctDifficulties = new Set(all.map((e) => e.difficulty)).size;
  const distinctNovelty = new Set(all.map((e) => e.novelty)).size;
  const distinctTypes = new Set(all.map((e) => e.evidenceType)).size;
  return clamp01((distinctDifficulties / 4 + distinctNovelty / 4 + distinctTypes / 9) / 3 + 0.15);
}

export interface AggregateEvidenceInput {
  studentId: string;
  attempts: RawAttemptRecord[];
  noveltyClassifier?: NoveltyClassifierAdapter;
}

const EVIDENCE_TYPE_BY_SOURCE: Record<RawAttemptRecord['sourceEvidenceType'], EvidenceType> = {
  PRACTICE: 'PRACTICE',
  RETENTION: 'RETENTION',
  TRANSFER: 'TRANSFER',
  SIMULATION: 'SIMULATION',
};

export async function aggregateEvidence(input: AggregateEvidenceInput): Promise<VerificationEvidence[]> {
  const { studentId, attempts } = input;

  const base: (Omit<VerificationEvidence, 'quality'> & { occurredAt: string })[] = [];
  for (const a of attempts) {
    const novelty: NoveltyLevel = a.noveltyHint
      ?? (input.noveltyClassifier
        ? await input.noveltyClassifier.classify(studentId, a.topic, `${a.capability}:${a.difficulty}`)
        : 'RELATED'); // documented naive fallback — Section 10 / TRUTH_TABLE.md

    // Evidence ids are scoped by studentId, not just attemptId: relying on
    // the upstream capability model's attempt ids being globally unique
    // would make cross-student data isolation depend on a system this
    // feature doesn't own. Scoping the id here means an id collision can
    // never target another student's row, defense-in-depth alongside RLS
    // (see db.rls.test.ts).
    base.push({
      id: `ev_${studentId}_${a.attemptId}`,
      studentId,
      sessionId: null,
      sourceAttemptId: a.attemptId,
      evidenceType: EVIDENCE_TYPE_BY_SOURCE[a.sourceEvidenceType],
      capability: a.capability,
      difficulty: a.difficulty,
      novelty,
      performance: clamp01(a.performance),
      timeTakenMs: a.timeTakenMs,
      expectedTimeMs: a.expectedTimeMs,
      isValid: true,
      createdAt: a.occurredAt,
      occurredAt: a.occurredAt,
    });
  }

  const independence = independenceScores(base);
  const diversity = diversityScore(base);

  return base.map((e, i) => {
    const quality: EvidenceQuality = {
      recency: recencyScore(e.occurredAt),
      diversity,
      difficulty: difficultyScore(e.difficulty),
      novelty: noveltyScore(e.novelty),
      independence: independence[i] ?? 1,
      timePressure: e.timeTakenMs != null && e.expectedTimeMs != null
        ? timePressureScore(e.timeTakenMs, e.expectedTimeMs)
        : 0.5,
      targetRelevance: e.difficulty === 'TARGET' ? 1 : difficultyScore(e.difficulty),
      repeatedPerformance: clamp01(e.performance),
    };
    const { occurredAt, ...evidence } = e;
    void occurredAt;
    return { ...evidence, quality };
  });
}

export function overallQuality(q: EvidenceQuality): number {
  const weights: Record<keyof EvidenceQuality, number> = {
    recency: 0.12,
    diversity: 0.12,
    difficulty: 0.12,
    novelty: 0.16,
    independence: 0.18,
    timePressure: 0.14,
    targetRelevance: 0.1,
    repeatedPerformance: 0.06,
  };
  return clamp01(
    (Object.keys(weights) as (keyof EvidenceQuality)[])
      .reduce((sum, k) => sum + q[k] * weights[k], 0),
  );
}

export function summarizeEvidence(evidences: VerificationEvidence[]): EvidenceSummary {
  const byType: EvidenceSummary['byType'] = {};
  for (const e of evidences) {
    const bucket = byType[e.evidenceType] ?? { count: 0, avgPerformance: 0, avgQuality: 0 };
    const q = overallQuality(e.quality);
    bucket.avgPerformance = (bucket.avgPerformance * bucket.count + e.performance) / (bucket.count + 1);
    bucket.avgQuality = (bucket.avgQuality * bucket.count + q) / (bucket.count + 1);
    bucket.count += 1;
    byType[e.evidenceType] = bucket;
  }
  const overall = evidences.length
    ? evidences.reduce((s, e) => s + overallQuality(e.quality), 0) / evidences.length
    : 0;
  return { byType, totalCount: evidences.length, overallQuality: clamp01(overall) };
}
