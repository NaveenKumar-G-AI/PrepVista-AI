import type { ConfidenceInputs, Evidence, ReadinessDimensionKey, SimulationRecord } from "../domain/types.js";
import {
  analyzeConditionGap,
  analyzeConsistency,
  analyzeNovelPerformance,
  detectSkillDecay,
} from "./crossSimulationAnalysis.js";
import { buildSimulationPostmortem, type SimulationPostmortem } from "./postmortemEngine.js";
import { overallAccuracy } from "./withinSimulationAnalysis.js";
import { clamp, round1, scoreFromGapPoints } from "./scoringHelpers.js";

export interface ConceptMasteryHint {
  score: number; // 0-100, from Feature 8 (see src/integration/feature8Client.ts)
  sampleSize: number;
}

export interface DimensionComputation {
  dimensionKey: ReadinessDimensionKey;
  score: number;
  confidenceInputs: ConfidenceInputs;
  evidenceSummary: string;
  evidence: Array<Omit<Evidence, "id" | "confidence" | "dimensionKey">>;
}

export interface DimensionComputationResult {
  dimensions: DimensionComputation[];
  /** Confidence inputs for the OVERALL (not per-dimension) readiness claim —
   * anchored on realistic-simulation evidence, the same basis as the
   * `accuracy` dimension, since overall readiness is fundamentally a claim
   * about real-assessment performance. */
  overallConfidenceInputs: ConfidenceInputs;
  /** Number of submitted realistic simulations — the evidence count that
   * gates the six-tier overall state (Section 2). Practice-mode simulations
   * inform individual dimensions but don't count toward "have we actually
   * seen this student under real conditions". */
  realisticSimulationCount: number;
  mostRecentRealisticSimulationId: string | null;
}

const scoreFromStddev = (sd: number): number => clamp(100 - sd * 2.5);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * The full deterministic scoring pass over one student's simulation history.
 * Nothing here calls a database or an LLM (Section 45) — it's a pure function
 * of (simulations, conceptMasteryHint) so it's directly unit-testable and
 * directly reusable by both the live readiness engine and the test suite's
 * synthetic scenarios.
 */
export function computeDimensions(
  simulations: SimulationRecord[],
  conceptMasteryHint: ConceptMasteryHint | null,
  asOf: Date = new Date()
): DimensionComputationResult {
  const submitted = simulations.filter((s) => s.status === "submitted");
  const realisticSims = submitted
    .filter((s) => s.practiceMode === "realistic_simulation")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
  const topicPracticeSims = submitted.filter((s) => s.practiceMode === "topic_practice");
  const timedPracticeSims = submitted.filter((s) => s.practiceMode === "timed_practice");

  const mostRecentRealistic = realisticSims[0] ?? null;
  const postmortem: SimulationPostmortem | null = mostRecentRealistic ? buildSimulationPostmortem(mostRecentRealistic) : null;

  const conditionGap = analyzeConditionGap(submitted);
  const consistency = analyzeConsistency(submitted);
  const skillDecay = detectSkillDecay(submitted);
  const novelty = analyzeNovelPerformance(submitted);

  const pooledRealisticAccuracy = overallAccuracy(realisticSims.flatMap((s) => s.attempts));
  const topicPracticeAccuracy = overallAccuracy(topicPracticeSims.flatMap((s) => s.attempts));

  const recencyDays = mostRecentRealistic?.submittedAt
    ? Math.floor((asOf.getTime() - new Date(mostRecentRealistic.submittedAt).getTime()) / 86_400_000)
    : null;
  const consistencyNormalized = consistency.stddev !== null ? clamp01(1 - consistency.stddev / 40) : null;

  const distinctTopicsTouched = new Set(realisticSims.flatMap((s) => s.attempts.map((a) => a.topicId))).size;
  const allTopicsEverSeen = new Set(submitted.flatMap((s) => s.attempts.map((a) => a.topicId))).size;
  const topicCoverage = allTopicsEverSeen > 0 ? distinctTopicsTouched / allTopicsEverSeen : 0;
  const distinctDifficultiesTouched = new Set(realisticSims.flatMap((s) => s.attempts.map((a) => a.difficulty))).size;
  const difficultyCoverage = distinctDifficultiesTouched / 3;

  const baseConfidenceInputs = (sampleSize: number, assessmentSimilarity: number): ConfidenceInputs => ({
    sampleSize,
    recencyDays,
    consistency: consistencyNormalized,
    assessmentSimilarity,
    novelty: novelty.novelFractionMostRecent,
    topicCoverage: clamp01(topicCoverage),
    difficultyCoverage: clamp01(difficultyCoverage),
  });

  const out: DimensionComputation[] = [];

  // 1. concept — Section 27/28: in production this is a call to Feature 8's
  // mastery system, not derived here. The topic-practice fallback below only
  // exists so the prototype is meaningful before that integration is wired.
  {
    const score = conceptMasteryHint?.score ?? topicPracticeAccuracy ?? 50;
    const sampleSize = conceptMasteryHint?.sampleSize ?? topicPracticeSims.length;
    out.push({
      dimensionKey: "concept",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(sampleSize, 0.35),
      evidenceSummary: conceptMasteryHint
        ? `Feature 8 mastery signal: ${round1(score)}%.`
        : topicPracticeAccuracy !== null
          ? `Untimed topic-practice accuracy: ${round1(topicPracticeAccuracy)}% across ${topicPracticeSims.length} session(s).`
          : "No concept-mastery evidence yet.",
      evidence:
        topicPracticeAccuracy !== null
          ? [
              {
                claim: "Concept-level accuracy in low-pressure practice",
                observation: `${round1(topicPracticeAccuracy)}% accuracy across ${topicPracticeSims.length} topic-practice session(s).`,
                sampleSize: topicPracticeSims.length,
                timeWindow: "all topic-practice history",
                supportingData: { topicPracticeAccuracy, sessionCount: topicPracticeSims.length },
              },
            ]
          : [],
    });
  }

  // 2. accuracy — raw accuracy under full realistic-simulation conditions.
  {
    const score = pooledRealisticAccuracy ?? 50;
    out.push({
      dimensionKey: "accuracy",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(realisticSims.length, 1.0),
      evidenceSummary:
        pooledRealisticAccuracy !== null
          ? `${round1(pooledRealisticAccuracy)}% accuracy across ${realisticSims.length} realistic simulation(s).`
          : "No realistic-simulation evidence yet.",
      evidence:
        pooledRealisticAccuracy !== null
          ? [
              {
                claim: "Accuracy under full realistic assessment conditions",
                observation: `${round1(pooledRealisticAccuracy)}% across ${realisticSims.length} realistic simulation(s).`,
                sampleSize: realisticSims.length,
                timeWindow: "all realistic-simulation history",
                supportingData: { pooledRealisticAccuracy },
              },
            ]
          : [],
    });
  }

  // 3. speed — share of answered questions NOT landing in a "slow" bucket.
  {
    const sa = postmortem?.speedAccuracy ?? null;
    const slowPct = sa ? sa.buckets.HIGH_ACCURACY_LOW_SPEED + sa.buckets.LOW_ACCURACY_LOW_SPEED : null;
    const score = slowPct !== null ? clamp(100 - slowPct) : 50;
    out.push({
      dimensionKey: "speed",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(sa?.sampleSize ?? 0, 1.0),
      evidenceSummary: sa
        ? `${round1(100 - slowPct!)}% of answered questions were within expected time in the most recent simulation.`
        : "No timed-question evidence yet.",
      evidence: sa
        ? [
            {
              claim: "Response speed relative to expected time",
              observation: `In the most recent simulation, ${sa.buckets.HIGH_ACCURACY_LOW_SPEED + sa.buckets.LOW_ACCURACY_LOW_SPEED}% of answered questions took notably longer than expected.`,
              sampleSize: sa.sampleSize,
              timeWindow: "most recent realistic simulation",
              supportingData: sa.buckets,
            },
          ]
        : [],
    });
  }

  // 4. time_pressure — the pure "does a clock change your accuracy" delta:
  // untimed topic practice vs timed practice.
  {
    const practiceAcc = conditionGap.byMode.find((m) => m.mode === "topic_practice")?.accuracy ?? null;
    const timedAcc = conditionGap.byMode.find((m) => m.mode === "timed_practice")?.accuracy ?? null;
    const gap = practiceAcc !== null && timedAcc !== null ? round1(practiceAcc - timedAcc) : null;
    const score = gap !== null ? scoreFromGapPoints(gap) : 50;
    out.push({
      dimensionKey: "time_pressure",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(timedPracticeSims.length, 0.6),
      evidenceSummary:
        gap !== null
          ? `Accuracy drops ${gap} points when a timer is introduced (${practiceAcc}% untimed vs ${timedAcc}% timed).`
          : "Not enough timed vs. untimed evidence yet.",
      evidence:
        gap !== null
          ? [
              {
                claim: "Accuracy change when time pressure is introduced",
                observation: `${practiceAcc}% untimed vs ${timedAcc}% timed, a ${gap}-point drop.`,
                sampleSize: timedPracticeSims.length,
                timeWindow: "all timed-practice history",
                supportingData: { practiceAcc, timedAcc, gap },
              },
            ]
          : [],
    });
  }

  // 5. mixed_topic — accuracy cost immediately after a topic transition.
  {
    const ts = postmortem?.topicSwitching ?? null;
    const score = ts?.accuracyCost !== null && ts?.accuracyCost !== undefined ? scoreFromGapPoints(ts.accuracyCost) : 50;
    out.push({
      dimensionKey: "mixed_topic",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(ts?.switchCount ?? 0, 1.0),
      evidenceSummary: ts?.observation ?? "Not enough topic-transition evidence yet.",
      evidence: ts?.observation
        ? [
            {
              claim: "Accuracy immediately after switching topics",
              observation: ts.observation,
              sampleSize: ts.switchCount,
              timeWindow: "most recent realistic simulation",
              supportingData: { postSwitchAccuracy: ts.postSwitchAccuracy, steadyStateAccuracy: ts.steadyStateAccuracy },
            },
          ]
        : [],
    });
  }

  // 6. novel_question — accuracy specifically on never-seen-before questions.
  {
    const score = novelty.novelAccuracy ?? 50;
    out.push({
      dimensionKey: "novel_question",
      score: round1(score),
      confidenceInputs: {
        ...baseConfidenceInputs(novelty.sampleSizeNovel, 1.0),
        novelty: 1.0,
      },
      evidenceSummary:
        novelty.novelAccuracy !== null
          ? `${novelty.novelAccuracy}% accuracy on previously-unseen questions (n=${novelty.sampleSizeNovel}).`
          : "No novel-question evidence yet.",
      evidence:
        novelty.novelAccuracy !== null
          ? [
              {
                claim: "Accuracy on questions never seen before",
                observation: `${novelty.novelAccuracy}% on ${novelty.sampleSizeNovel} novel questions` +
                  (novelty.seenBeforeAccuracy !== null ? `, vs ${novelty.seenBeforeAccuracy}% on previously-seen questions.` : "."),
                sampleSize: novelty.sampleSizeNovel,
                timeWindow: "all simulation history",
                supportingData: { novelAccuracy: novelty.novelAccuracy, seenBeforeAccuracy: novelty.seenBeforeAccuracy },
              },
            ]
          : [],
    });
  }

  // 7. retention — penalized per detected skill-decay signal (Section 25).
  {
    const retestedTopicCount = allTopicsEverSeen; // topics with any history at all; decay needs >=2 data points, computed inside detectSkillDecay
    const score = skillDecay.length > 0 ? clamp(100 - skillDecay.length * 15) : retestedTopicCount > 0 ? 80 : 50;
    out.push({
      dimensionKey: "retention",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(retestedTopicCount, 0.7),
      evidenceSummary:
        skillDecay.length > 0
          ? `${skillDecay.length} topic(s) show a retention gap since last tested.`
          : retestedTopicCount > 0
            ? "No retention decay detected in topics tested more than once."
            : "Not enough repeated-topic evidence yet.",
      evidence: skillDecay.map((d) => ({
        claim: `Retention gap on a previously-strong topic`,
        observation: d.observation,
        sampleSize: 2,
        timeWindow: `${d.daysSinceLastTested} days`,
        supportingData: { topicId: d.topicId, peakAccuracy: d.peakAccuracy, currentAccuracy: d.currentAccuracy },
      })),
    });
  }

  // 8. consistency — variance across realistic simulations (Section 17).
  {
    const score = consistency.stddev !== null ? scoreFromStddev(consistency.stddev) : 50;
    out.push({
      dimensionKey: "consistency",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(consistency.sampleSize, 1.0),
      evidenceSummary:
        consistency.stddev !== null
          ? `Scores range from ${consistency.worst}% to ${consistency.best}% across ${consistency.sampleSize} simulations (std. dev. ${consistency.stddev}).`
          : "Not enough realistic simulations yet to measure consistency.",
      evidence:
        consistency.stddev !== null
          ? [
              {
                claim: "Score consistency across realistic simulations",
                observation: `Scores: ${consistency.scores.join(", ")}. Average ${consistency.average}%, range ${consistency.range} points.`,
                sampleSize: consistency.sampleSize,
                timeWindow: "all realistic-simulation history",
                supportingData: { scores: consistency.scores, stddev: consistency.stddev, trendSlope: consistency.trendSlope },
              },
            ]
          : [],
    });
  }

  // 9. assessment_condition — holistic practice-to-simulation gap across the
  // full mode ladder (Section 8). Deliberately correlated with time_pressure
  // (#4) and mixed_topic (#5) — the brief defines Condition Gap Detection and
  // Pressure Performance as related-but-separate detectors; this dimension
  // is the broad "does moving into assessment conditions cost you" signal,
  // #4 isolates the timer specifically, #5 isolates topic switching
  // specifically.
  {
    const score = conditionGap.gapSizePoints !== null ? scoreFromGapPoints(conditionGap.gapSizePoints) : 50;
    out.push({
      dimensionKey: "assessment_condition",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(realisticSims.length, 1.0),
      evidenceSummary: conditionGap.observation ?? "Not enough practice-vs-simulation evidence yet.",
      evidence: conditionGap.observation
        ? [
            {
              claim: "Overall gap between practice and full assessment conditions",
              observation: conditionGap.observation,
              sampleSize: realisticSims.length,
              timeWindow: "all simulation history",
              supportingData: { byMode: conditionGap.byMode },
            },
          ]
        : [],
    });
  }

  // 10. recovery — Section 16. Zero detected errors means zero evidence, not
  // a perfect score — see confidence sampleSize below.
  {
    const rec = postmortem?.recovery ?? null;
    const score = rec?.postErrorRecoveryRate ?? 50;
    out.push({
      dimensionKey: "recovery",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(rec?.errorEventCount ?? 0, 1.0),
      evidenceSummary:
        rec && rec.postErrorRecoveryRate !== null
          ? `${rec.postErrorRecoveryRate}% of answers immediately after a mistake were correct (${rec.errorEventCount} mistake(s) observed).`
          : "No mistakes observed yet to measure recovery from.",
      evidence:
        rec && rec.postErrorRecoveryRate !== null
          ? [
              {
                claim: "Performance immediately following a mistake",
                observation: `${rec.postErrorRecoveryRate}% correct in the questions right after an error, across ${rec.errorEventCount} error(s). Longest post-error miss streak: ${rec.longestPostErrorMissStreak}.`,
                sampleSize: rec.errorEventCount,
                timeWindow: "most recent realistic simulation",
                supportingData: { ...rec } as Record<string, unknown>,
              },
            ]
          : [],
    });
  }

  // 11. question_selection — Section 11.
  {
    const qs = postmortem?.questionSelection ?? null;
    const score = qs?.sampleSize ? qs.score : 50;
    out.push({
      dimensionKey: "question_selection",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(qs?.sampleSize ?? 0, 1.0),
      evidenceSummary: qs?.sampleSize
        ? `${qs.score}% of solve/skip/return decisions were effective in the most recent simulation.`
        : "Not enough decision evidence yet.",
      evidence: qs?.sampleSize
        ? [
            {
              claim: "Effectiveness of solve/skip/return decisions",
              observation: `${qs.breakdown.EFFECTIVE} effective, ${qs.breakdown.INEFFICIENT} inefficient, ${qs.breakdown.MISSED_OPPORTUNITY} missed-opportunity decisions out of ${qs.sampleSize} classified.`,
              sampleSize: qs.sampleSize,
              timeWindow: "most recent realistic simulation",
              supportingData: qs.breakdown,
            },
          ]
        : [],
    });
  }

  // 12. time_allocation — Section 10.
  {
    const ta = postmortem?.timeAllocation ?? null;
    const total = postmortem?.totalQuestions ?? 0;
    const score = ta
      ? clamp(100 - ta.sinkObservations.length * 20 - (total > 0 ? (postmortem!.unansweredCount / total) * 40 : 0))
      : 50;
    out.push({
      dimensionKey: "time_allocation",
      score: round1(score),
      confidenceInputs: baseConfidenceInputs(total, 1.0),
      evidenceSummary:
        ta && ta.sinkObservations.length > 0
          ? ta.sinkObservations[0]!
          : ta
            ? "No major time-allocation issues detected in the most recent simulation."
            : "Not enough evidence yet.",
      evidence: (ta?.sinkObservations ?? []).map((obs) => ({
        claim: "Time invested without a payoff",
        observation: obs,
        sampleSize: 1,
        timeWindow: "most recent realistic simulation",
        supportingData: {},
      })),
    });
  }

  return {
    dimensions: out,
    overallConfidenceInputs: baseConfidenceInputs(realisticSims.length, 1.0),
    realisticSimulationCount: realisticSims.length,
    mostRecentRealisticSimulationId: mostRecentRealistic?.id ?? null,
  };
}
