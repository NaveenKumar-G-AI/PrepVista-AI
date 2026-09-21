import type { PracticeMode, QuestionAttempt, SimulationRecord } from "../domain/types.js";
import { overallAccuracy } from "./withinSimulationAnalysis.js";

// Operates across a student's simulation HISTORY (multiple SimulationRecord),
// as opposed to withinSimulationAnalysis.ts which looks inside one. Still
// pure, deterministic, no I/O.

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Sections 8, 14 — condition gap / time-pressure gap
// ---------------------------------------------------------------------------

/** Rough "pressure ladder" the practice modes sit on, per Section 14's
 * untimed -> timed -> strict timed -> full simulation progression. Only used
 * to order the comparison output, not as a hidden scoring input. */
const MODE_ORDER: PracticeMode[] = ["topic_practice", "timed_practice", "mixed_practice", "realistic_simulation"];

export interface ModeAccuracy {
  mode: PracticeMode;
  accuracy: number | null;
  sampleSize: number;
}

export interface ConditionGapResult {
  byMode: ModeAccuracy[];
  hasConditionGap: boolean;
  gapSizePoints: number | null; // topic_practice accuracy - realistic_simulation accuracy
  observation: string | null;
}

export function analyzeConditionGap(simulations: SimulationRecord[]): ConditionGapResult {
  const byMode: ModeAccuracy[] = MODE_ORDER.map((mode) => {
    const inMode = simulations.filter((s) => s.practiceMode === mode && s.status === "submitted");
    const accuracies = inMode.map((s) => overallAccuracy(s.attempts)).filter((a): a is number => a !== null);
    return {
      mode,
      accuracy: accuracies.length ? round1(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null,
      sampleSize: accuracies.length,
    };
  });

  const practiceEntry = byMode.find((m) => m.mode === "topic_practice");
  const simEntry = byMode.find((m) => m.mode === "realistic_simulation");
  const practiceAcc = practiceEntry?.accuracy ?? null;
  const simAcc = simEntry?.accuracy ?? null;

  const gapSizePoints = practiceAcc !== null && simAcc !== null ? round1(practiceAcc - simAcc) : null;
  const hasConditionGap = gapSizePoints !== null && gapSizePoints >= 12 && (simEntry?.sampleSize ?? 0) >= 1;

  return {
    byMode,
    hasConditionGap,
    gapSizePoints,
    observation: hasConditionGap
      ? `Topic-practice accuracy is ${practiceAcc}% but realistic-simulation accuracy is ${simAcc}%, ` +
        `a ${gapSizePoints}-point gap between practicing a topic and performing under full assessment conditions.`
      : null,
  };
}

// ---------------------------------------------------------------------------
// Section 17 — assessment consistency across multiple realistic simulations
// ---------------------------------------------------------------------------

export interface ConsistencyResult {
  scores: number[]; // chronological, oldest first
  average: number | null;
  variance: number | null;
  stddev: number | null;
  trendSlope: number | null; // points per simulation, simple linear fit
  range: number | null;
  worst: number | null;
  best: number | null;
  sampleSize: number;
}

export function analyzeConsistency(simulations: SimulationRecord[]): ConsistencyResult {
  const realistic = simulations
    .filter((s) => s.practiceMode === "realistic_simulation" && s.status === "submitted" && s.accuracy !== null)
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

  const scores = realistic.map((s) => round1((s.accuracy ?? 0) * 100));
  const n = scores.length;

  if (n === 0) {
    return { scores, average: null, variance: null, stddev: null, trendSlope: null, range: null, worst: null, best: null, sampleSize: 0 };
  }

  const average = round1(scores.reduce((a, b) => a + b, 0) / n);
  const variance = round1(scores.reduce((s, v) => s + (v - average) ** 2, 0) / n);
  const stddev = round1(Math.sqrt(variance));
  const worst = Math.min(...scores);
  const best = Math.max(...scores);
  const range = round1(best - worst);

  let trendSlope: number | null = null;
  if (n >= 2) {
    // Simple linear regression slope over simulation index (0..n-1).
    const xs = scores.map((_, i) => i);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = average;
    const num = xs.reduce((s, x, i) => s + (x - xMean) * ((scores[i] ?? 0) - yMean), 0);
    const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
    trendSlope = den !== 0 ? round1(num / den) : 0;
  }

  return { scores, average, variance, stddev, trendSlope, range, worst, best, sampleSize: n };
}

// ---------------------------------------------------------------------------
// Section 25 — skill decay detection
// ---------------------------------------------------------------------------

export interface SkillDecaySignal {
  topicId: string;
  peakAccuracy: number;
  currentAccuracy: number;
  daysSinceLastTested: number;
  observation: string;
}

/**
 * Compares each topic's best-ever accuracy against its accuracy in the most
 * recent simulation that touched it. Flags decay only when there's also a
 * gap in days since — a single bad recent attempt on a topic tested
 * yesterday is noise, not decay.
 */
export function detectSkillDecay(simulations: SimulationRecord[], now: Date = new Date()): SkillDecaySignal[] {
  const submitted = simulations.filter((s) => s.status === "submitted").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

  const perTopic = new Map<string, { accuracy: number; date: string }[]>();
  for (const sim of submitted) {
    if (!sim.submittedAt) continue;
    const byTopic = new Map<string, { correct: number; total: number }>();
    for (const a of sim.attempts) {
      if (a.isCorrect === null) continue;
      const entry = byTopic.get(a.topicId) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (a.isCorrect) entry.correct += 1;
      byTopic.set(a.topicId, entry);
    }
    for (const [topicId, { correct, total }] of byTopic) {
      if (total === 0) continue;
      const list = perTopic.get(topicId) ?? [];
      list.push({ accuracy: round1((correct / total) * 100), date: sim.submittedAt });
      perTopic.set(topicId, list);
    }
  }

  const signals: SkillDecaySignal[] = [];
  for (const [topicId, points] of perTopic) {
    if (points.length < 2) continue;
    const peak = points.reduce((max, p) => (p.accuracy > max.accuracy ? p : max));
    const latest = points[points.length - 1];
    if (!latest) continue;
    const daysSinceLastTested = Math.floor((now.getTime() - new Date(latest.date).getTime()) / (1000 * 60 * 60 * 24));

    if (peak.accuracy - latest.accuracy >= 15 && daysSinceLastTested >= 10 && peak.date !== latest.date) {
      signals.push({
        topicId,
        peakAccuracy: peak.accuracy,
        currentAccuracy: latest.accuracy,
        daysSinceLastTested,
        observation:
          `Accuracy on this topic peaked at ${peak.accuracy}% and is now ${latest.accuracy}%, ` +
          `last tested ${daysSinceLastTested} days ago.`,
      });
    }
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Sections 7, 40 — novelty: memorization vs transferred skill
// ---------------------------------------------------------------------------

export interface NovelPerformanceResult {
  novelAccuracy: number | null;
  seenBeforeAccuracy: number | null;
  /** Share of the most recent submitted simulation's questions this student
   * had never seen before — the "how much can we trust this as a transfer
   * test, vs a memory test" input to the confidence engine. */
  novelFractionMostRecent: number;
  sampleSizeNovel: number;
}

export function analyzeNovelPerformance(simulations: SimulationRecord[]): NovelPerformanceResult {
  const submitted = [...simulations]
    .filter((s) => s.status === "submitted")
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

  const seenQuestionIds = new Set<string>();
  const novelAttempts: QuestionAttempt[] = [];
  const seenAttempts: QuestionAttempt[] = [];
  let novelFractionMostRecent = 0;

  submitted.forEach((sim, idx) => {
    let novelInThisSim = 0;
    for (const a of sim.attempts) {
      if (seenQuestionIds.has(a.questionId)) {
        seenAttempts.push(a);
      } else {
        novelAttempts.push(a);
        novelInThisSim += 1;
      }
      seenQuestionIds.add(a.questionId);
    }
    if (idx === submitted.length - 1 && sim.attempts.length > 0) {
      novelFractionMostRecent = novelInThisSim / sim.attempts.length;
    }
  });

  const acc = (arr: QuestionAttempt[]) => {
    const a = arr.filter((x) => x.finalStatus === "answered" && x.isCorrect !== null);
    return a.length ? Math.round((a.filter((x) => x.isCorrect).length / a.length) * 1000) / 10 : null;
  };

  return {
    novelAccuracy: acc(novelAttempts),
    seenBeforeAccuracy: acc(seenAttempts),
    novelFractionMostRecent: Math.round(novelFractionMostRecent * 100) / 100,
    sampleSizeNovel: novelAttempts.length,
  };
}
