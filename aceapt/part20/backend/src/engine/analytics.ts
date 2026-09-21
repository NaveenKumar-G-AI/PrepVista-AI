import type { EngineQuestion, EngineResponse, EngineEvent, Marking } from "./types.js";
import { scoreSession, type ScoreResult } from "./scoring.js";
import { classifyDecision, type DecisionLabel } from "./decisionClassifier.js";
import { ANALYTICS_THRESHOLDS } from "../domain/constants.js";

export interface PerQuestionEvidence {
  sequenceIndex: number;
  questionId: string;
  concept: string;
  difficulty: string;
  attempted: boolean;
  correct: boolean;
  timeSec: number;
  markedForReview: boolean;
  status: "correct" | "wrong" | "unattempted";
  decision: DecisionLabel;
}

export interface SegmentEvidence {
  label: string;
  accuracyPct: number | null;
  attempted: number;
}

export interface BiggestLeak {
  type: "time-concentration" | "unattempted" | "degradation" | "none";
  text: string;
  questionNumbers?: number[];
}

export interface SessionEvidence extends ScoreResult {
  accuracyPct: number;
  attemptRatePct: number;
  totalTimeSec: number;
  avgTimePerQuestionSec: number;
  perQuestion: PerQuestionEvidence[];
  segments: SegmentEvidence[];
  degrading: boolean;
  overinvested: PerQuestionEvidence[];
  topTwoTimeSharePct: number;
  opportunityCostEquivalentQuestions: number;
  postErrorAccuracyPct: number | null;
  recoveryRatePct: number | null;
  recoverableCount: number;
  speedLabel: "Fast" | "Moderate" | "Slow";
  accuracyLabel: "High" | "Moderate" | "Low";
  speedAccuracyProfile: string;
  selectionQuality: "Strong" | "Moderate" | "Weak";
  biggestLeak: BiggestLeak;
  navigationJumps: number;
}

/**
 * The single deterministic entry point that turns raw session data into the
 * "Performance Intelligence" evidence object the report and the AI coaching
 * layer are both grounded in. No AI, no randomness — same inputs always
 * produce the same evidence (spec §55–§57).
 */
export function computeAnalytics(
  questions: EngineQuestion[],
  responses: Map<string, EngineResponse>,
  events: EngineEvent[],
  usedSec: number,
  marking: Marking
): SessionEvidence {
  const n = questions.length;
  const scoreResult: ScoreResult = scoreSession(questions, responses, marking);

  const orderedQuestions = questions.slice().sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const perQuestionRaw = orderedQuestions.map((q) => {
    const r = responses.get(q.id);
    const attempted = !!r && r.selectedIndex !== null && r.selectedIndex !== undefined;
    const correct = attempted && r!.selectedIndex === q.correctIndex;
    const timeSec = Math.round((r?.timeSpentMs || 0) / 1000);
    const status: PerQuestionEvidence["status"] = attempted ? (correct ? "correct" : "wrong") : "unattempted";
    return {
      sequenceIndex: q.sequenceIndex,
      questionId: q.id,
      concept: q.concept,
      difficulty: q.difficulty,
      attempted,
      correct,
      timeSec,
      markedForReview: !!r?.markedForReview,
      status,
    };
  });

  const sumTrackedTime = perQuestionRaw.reduce((s, p) => s + p.timeSec, 0);
  const totalTimeSec = sumTrackedTime > 0 ? sumTrackedTime : usedSec;
  const avgTimePerQuestionSec = n > 0 ? totalTimeSec / n : 0;

  const perQuestion: PerQuestionEvidence[] = perQuestionRaw.map((p) => ({
    ...p,
    decision: classifyDecision(p, avgTimePerQuestionSec),
  }));

  const attemptedList = perQuestion.filter((p) => p.attempted);
  const accuracyPct = attemptedList.length
    ? Math.round((attemptedList.filter((p) => p.correct).length / attemptedList.length) * 100)
    : 0;
  const attemptRatePct = n > 0 ? Math.round((attemptedList.length / n) * 100) : 0;

  // ---- time concentration / overinvestment (spec §6, §17, §33) ----
  const sortedByTime = [...perQuestion].sort((a, b) => b.timeSec - a.timeSec);
  const topTwo = sortedByTime.slice(0, 2);
  const topTwoTimeSum = topTwo.reduce((s, p) => s + p.timeSec, 0);
  const topTwoTimeSharePct = totalTimeSec > 0 ? Math.round((topTwoTimeSum / totalTimeSec) * 100) : 0;

  const overinvested = perQuestion.filter(
    (p) =>
      p.timeSec >= ANALYTICS_THRESHOLDS.overinvestmentMinSec &&
      p.timeSec > avgTimePerQuestionSec * ANALYTICS_THRESHOLDS.overinvestmentMultiplier
  );
  const extraTime = overinvested.reduce((s, p) => s + (p.timeSec - avgTimePerQuestionSec), 0);
  const opportunityCostEquivalentQuestions =
    avgTimePerQuestionSec > 0 ? Math.round((extraTime / avgTimePerQuestionSec) * 10) / 10 : 0;

  // ---- performance across the test, in thirds (spec §11) ----
  const segSize = Math.ceil(n / 3) || 1;
  const segments: SegmentEvidence[] = [0, 1, 2].map((s) => {
    const slice = perQuestion.slice(s * segSize, s * segSize + segSize);
    const att = slice.filter((p) => p.attempted);
    const accuracyPctSeg = att.length ? Math.round((att.filter((p) => p.correct).length / att.length) * 100) : null;
    const startNum = s * segSize + 1;
    const endNum = Math.min(s * segSize + segSize, n);
    return { label: `Q${startNum}–${endNum}`, accuracyPct: accuracyPctSeg, attempted: att.length };
  });
  const firstSeg = segments[0]?.accuracyPct ?? null;
  const lastSeg = segments[segments.length - 1]?.accuracyPct ?? null;
  const degrading =
    firstSeg != null && lastSeg != null && firstSeg - lastSeg >= ANALYTICS_THRESHOLDS.degradationThresholdPct;

  // ---- error momentum (spec §12) — read with the doc's own caution: a
  // single session is limited evidence, so this is reported, not diagnosed.
  let afterErrorCorrect = 0;
  let afterErrorTotal = 0;
  perQuestion.forEach((p, idx) => {
    if (p.status === "wrong") {
      for (let k = idx + 1; k < Math.min(idx + 3, n); k++) {
        const next = perQuestion[k];
        if (next.attempted) {
          afterErrorTotal++;
          if (next.correct) afterErrorCorrect++;
        }
      }
    }
  });
  const postErrorAccuracyPct = afterErrorTotal > 0 ? Math.round((afterErrorCorrect / afterErrorTotal) * 100) : null;

  // ---- recovery after a hard miss (spec §13–§14) ----
  const hardMisses = perQuestion.filter(
    (p) => (p.difficulty === "Hard" || p.difficulty === "Very Hard") && !p.correct
  );
  let recovered = 0;
  let recoverableCount = 0;
  hardMisses.forEach((p) => {
    const next = perQuestion.find((q) => q.sequenceIndex === p.sequenceIndex + 1);
    if (next && next.attempted) {
      recoverableCount++;
      if (next.correct) recovered++;
    }
  });
  const recoveryRatePct = recoverableCount > 0 ? Math.round((recovered / recoverableCount) * 100) : null;

  // ---- navigation efficiency (spec §19) ----
  const navEvents = events.filter((e) => e.type === "NAVIGATED" && e.fromIndex != null && e.toIndex != null);
  const navigationJumps = navEvents.filter(
    (e) => Math.abs((e.toIndex as number) - (e.fromIndex as number)) > 1
  ).length;

  // ---- speed / accuracy quadrant (spec §9) ----
  const speedLabel: SessionEvidence["speedLabel"] =
    avgTimePerQuestionSec < 60 ? "Fast" : avgTimePerQuestionSec < 100 ? "Moderate" : "Slow";
  const accuracyLabel: SessionEvidence["accuracyLabel"] =
    accuracyPct >= 75 ? "High" : accuracyPct >= 50 ? "Moderate" : "Low";
  const speedAccuracyProfile = `${accuracyLabel} Accuracy + ${speedLabel} Speed`;

  // ---- question-selection quality (spec §20) ----
  let selectionQuality: SessionEvidence["selectionQuality"] = "Strong";
  if (
    overinvested.length >= ANALYTICS_THRESHOLDS.selectionWeakOverinvestedCount ||
    topTwoTimeSharePct >= ANALYTICS_THRESHOLDS.selectionWeakTopTwoTimeSharePct
  ) {
    selectionQuality = "Weak";
  } else if (
    overinvested.length >= 1 ||
    topTwoTimeSharePct >= ANALYTICS_THRESHOLDS.selectionModerateTopTwoTimeSharePct
  ) {
    selectionQuality = "Moderate";
  }

  // ---- single headline "biggest leak" (spec §47) ----
  let biggestLeak: BiggestLeak;
  if (overinvested.length > 0 && topTwoTimeSharePct >= ANALYTICS_THRESHOLDS.biggestLeakTimeSharePct) {
    biggestLeak = {
      type: "time-concentration",
      text: `${topTwo.length === 1 ? "One question" : "Two questions"} consumed ${topTwoTimeSharePct}% of your total test time.`,
      questionNumbers: topTwo.map((p) => p.sequenceIndex + 1),
    };
  } else if (scoreResult.unattemptedCount >= Math.round(n * 0.25)) {
    biggestLeak = { type: "unattempted", text: `${scoreResult.unattemptedCount} questions were left unattempted.` };
  } else if (degrading) {
    biggestLeak = {
      type: "degradation",
      text: `Your accuracy dropped from ${firstSeg}% in the first section to ${lastSeg}% in the last.`,
    };
  } else {
    biggestLeak = {
      type: "none",
      text: "No major performance leak detected — your time and accuracy stayed consistent.",
    };
  }

  return {
    ...scoreResult,
    accuracyPct,
    attemptRatePct,
    totalTimeSec,
    avgTimePerQuestionSec,
    perQuestion,
    segments,
    degrading,
    overinvested,
    topTwoTimeSharePct,
    opportunityCostEquivalentQuestions,
    postErrorAccuracyPct,
    recoveryRatePct,
    recoverableCount,
    speedLabel,
    accuracyLabel,
    speedAccuracyProfile,
    selectionQuality,
    biggestLeak,
    navigationJumps,
  };
}
