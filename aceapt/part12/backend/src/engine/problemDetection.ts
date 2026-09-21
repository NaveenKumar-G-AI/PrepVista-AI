import { randomUUID } from 'crypto';
import { StudentState, DetectedProblem, AttemptSummary, EvidenceItem } from '../domain/types';
import { ENGINE_CONFIG } from '../config';

function groupByTopic(attempts: AttemptSummary[]): Map<string, AttemptSummary[]> {
  const map = new Map<string, AttemptSummary[]>();
  for (const a of attempts) {
    if (!map.has(a.topic)) map.set(a.topic, []);
    map.get(a.topic)!.push(a);
  }
  return map;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Deterministic, transparent confidence heuristic — NOT a statistical p-value.
// More samples and a bigger effect (relative to the detection threshold) raise
// confidence. Centralized here rather than scattered per-detector.
function confidenceFromSamples(sampleSize: number, effect: number, minEffect: number): number {
  const sampleTerm = Math.min(sampleSize / 10, 1); // saturates at 10 samples
  const effectTerm = Math.min(effect / (minEffect * 2), 1);
  const raw = 0.4 + 0.35 * sampleTerm + 0.25 * effectTerm;
  return Math.round(Math.min(raw, 0.97) * 100) / 100;
}

/** SPEED_GAP: strong untimed accuracy, much weaker timed/simulation accuracy. */
function detectSpeedGap(topic: string, attempts: AttemptSummary[]): DetectedProblem | null {
  const cfg = ENGINE_CONFIG.speedGap;
  const untimed = attempts.filter(a => a.mode === 'untimed');
  const timed = attempts.filter(a => a.mode === 'timed' || a.mode === 'simulation');
  if (untimed.length < cfg.minSamplesPerGroup || timed.length < cfg.minSamplesPerGroup) return null;

  const untimedAcc = avg(untimed.map(a => a.accuracyPct));
  const timedAcc = avg(timed.map(a => a.accuracyPct));
  const gap = untimedAcc - timedAcc;
  if (gap < cfg.minGapPct) return null;

  const evidence: EvidenceItem[] = [
    { description: `${untimed.length} untimed attempt(s) averaging ${untimedAcc.toFixed(0)}% accuracy`, sampleSize: untimed.length },
    { description: `${timed.length} timed/simulation attempt(s) averaging ${timedAcc.toFixed(0)}% accuracy`, sampleSize: timed.length }
  ];

  return {
    id: randomUUID(),
    category: 'SPEED_GAP',
    topic,
    evidence,
    confidence: confidenceFromSamples(untimed.length + timed.length, gap, cfg.minGapPct),
    reason: `Untimed accuracy (${untimedAcc.toFixed(0)}%) is well above timed/simulation accuracy (${timedAcc.toFixed(
      0
    )}%) across ${untimed.length + timed.length} comparable attempts.`,
    baselineAccuracyPct: timedAcc
  };
}

/** CONCEPT_GAP: accuracy stays low regardless of mode — points at the underlying idea, not speed. */
function detectConceptGap(topic: string, attempts: AttemptSummary[]): DetectedProblem | null {
  const cfg = ENGINE_CONFIG.conceptGap;
  if (attempts.length < cfg.minSamples) return null;

  const acc = avg(attempts.map(a => a.accuracyPct));
  if (acc > cfg.maxAccuracyPct) return null;

  const withHints = attempts.filter(a => typeof a.hintsUsed === 'number');
  const evidence: EvidenceItem[] = [
    {
      description: `${attempts.length} recent attempt(s) averaging ${acc.toFixed(0)}% accuracy across both timed and untimed modes`,
      sampleSize: attempts.length
    }
  ];
  if (withHints.length > 0) {
    const avgHints = avg(withHints.map(a => a.hintsUsed as number));
    evidence.push({ description: `Average of ${avgHints.toFixed(1)} hints used per attempt`, sampleSize: withHints.length });
  }

  return {
    id: randomUUID(),
    category: 'CONCEPT_GAP',
    topic,
    evidence,
    confidence: confidenceFromSamples(attempts.length, cfg.maxAccuracyPct - acc, 10),
    reason: `Accuracy stays low (${acc.toFixed(
      0
    )}%) regardless of time pressure, which points to the underlying concept rather than speed or careless errors.`,
    baselineAccuracyPct: acc
  };
}

/** CALCULATION_GAP: the approach looks right more often than the final answer is right. */
function detectCalculationGap(topic: string, attempts: AttemptSummary[]): DetectedProblem | null {
  const cfg = ENGINE_CONFIG.calculationGap;
  const withIndep = attempts.filter(a => typeof a.independentCorrectPct === 'number');
  if (withIndep.length < cfg.minSamples) return null;

  const acc = avg(withIndep.map(a => a.accuracyPct));
  const indep = avg(withIndep.map(a => a.independentCorrectPct as number));
  const gap = indep - acc;
  if (acc > cfg.maxAccuracyPct || gap < cfg.minGapPct) return null;

  return {
    id: randomUUID(),
    category: 'CALCULATION_GAP',
    topic,
    evidence: [
      {
        description: `${withIndep.length} attempt(s) show ${indep.toFixed(0)}% independent correctness but only ${acc.toFixed(
          0
        )}% overall accuracy`,
        sampleSize: withIndep.length
      }
    ],
    confidence: confidenceFromSamples(withIndep.length, gap, cfg.minGapPct),
    reason: `The approach looks right more often than the final answer is, which is more consistent with execution slips than a conceptual gap.`,
    baselineAccuracyPct: acc
  };
}

/** RETENTION_GAP: performance holds up now but drops off after a delay. */
function detectRetentionGap(topic: string, state: StudentState): DetectedProblem | null {
  const cfg = ENGINE_CONFIG.retentionGap;
  if (state.retentionSignals === 'unavailable') return null;
  const signals = state.retentionSignals.filter(s => s.topic === topic);
  if (signals.length < cfg.minSamples) return null;

  const recentTopicAttempts = state.recentPerformance.filter(a => a.topic === topic);
  if (recentTopicAttempts.length === 0) return null;

  const currentAcc = avg(recentTopicAttempts.map(a => a.accuracyPct));
  const retentionAcc = avg(signals.map(s => s.accuracyPct));
  const drop = currentAcc - retentionAcc;
  if (currentAcc < cfg.minCurrentAccuracyPct || drop < cfg.minDropPct) return null;

  return {
    id: randomUUID(),
    category: 'RETENTION_GAP',
    topic,
    evidence: [
      {
        description: `Accuracy after a delay (${retentionAcc.toFixed(0)}%) is meaningfully lower than recent performance (${currentAcc.toFixed(
          0
        )}%)`,
        sampleSize: signals.length
      }
    ],
    confidence: confidenceFromSamples(signals.length, drop, cfg.minDropPct),
    reason: `Performance holds up in the moment but drops off after a delay, which points to a retention gap rather than a skill gap.`,
    baselineAccuracyPct: retentionAcc
  };
}

/** TRANSFER_GAP: strong on familiar formats, weak on novel ones. */
function detectTransferGap(topic: string, state: StudentState): DetectedProblem | null {
  const cfg = ENGINE_CONFIG.transferGap;
  if (state.transferSignals === 'unavailable') return null;
  const signals = state.transferSignals.filter(s => s.topic === topic);
  if (signals.length < cfg.minSamples) return null;

  const familiar = avg(signals.map(s => s.familiarAccuracyPct));
  const novel = avg(signals.map(s => s.novelAccuracyPct));
  const gap = familiar - novel;
  if (gap < cfg.minGapPct) return null;

  return {
    id: randomUUID(),
    category: 'TRANSFER_GAP',
    topic,
    evidence: [
      {
        description: `Familiar-format accuracy (${familiar.toFixed(0)}%) is well above novel-format accuracy (${novel.toFixed(0)}%)`,
        sampleSize: signals.length
      }
    ],
    confidence: confidenceFromSamples(signals.length, gap, cfg.minGapPct),
    reason: `Strong performance on familiar question formats does not yet generalise to unfamiliar ones.`,
    baselineAccuracyPct: novel
  };
}

/**
 * Runs every implemented detector across every topic present in recent
 * performance and returns all problems with enough evidence to clear their
 * thresholds. A student can have more than one active problem at once (e.g. a
 * speed gap in one topic and a concept gap in another) — that's expected, not
 * a bug. Concept gap and calculation gap are treated as mutually exclusive
 * explanations for the same topic; whichever has stronger evidence wins.
 */
export function detectLearningProblems(state: StudentState): DetectedProblem[] {
  const byTopic = groupByTopic(state.recentPerformance);
  const problems: DetectedProblem[] = [];

  for (const [topic, attempts] of byTopic) {
    const speed = detectSpeedGap(topic, attempts);
    if (speed) problems.push(speed);

    const concept = detectConceptGap(topic, attempts);
    const calculation = detectCalculationGap(topic, attempts);
    if (concept && calculation) {
      problems.push(concept.confidence >= calculation.confidence ? concept : calculation);
    } else if (concept) {
      problems.push(concept);
    } else if (calculation) {
      problems.push(calculation);
    }

    const retention = detectRetentionGap(topic, state);
    if (retention) problems.push(retention);

    const transfer = detectTransferGap(topic, state);
    if (transfer) problems.push(transfer);
  }

  return problems;
}
