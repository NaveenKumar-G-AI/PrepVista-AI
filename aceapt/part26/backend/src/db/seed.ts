import { RawTopicEvidence } from "../types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Seeded "existing evidence" for one demo student, standing in for what
 * PrepVista's real mastery/retention/transfer/attempt-history services
 * would supply (section 4 - no such codebase was provided here, so this is
 * the integration boundary to replace).
 *
 * These numbers are not arbitrary: they are lifted directly from the master
 * prompt's own worked examples so the engine's output can be checked
 * against the document that specified it.
 *
 *   - Percentages          -> section 9  (transfer gap despite strong mastery)
 *   - Probability          -> section 10 (retention gap; transfer unknown)
 *   - Time & Work          -> speed-limited bottleneck (section 23/24 style)
 *   - Averages             -> section 11 (stable capability)
 *   - Algebra Basics       -> plain concept gap (root of a prerequisite chain)
 *   - Quadratic Equations  -> section 27 (weak topic whose real cause is a
 *                             weak prerequisite)
 *   - Profit & Loss        -> section 18 (too little evidence to diagnose yet)
 *   - Ratio & Proportion   -> section 22 (recurring method-selection error)
 */
export function seedEvidence(): RawTopicEvidence[] {
  return [
    {
      topicId: "percentages",
      topicName: "Percentages",
      mastery: 94,
      retention: 91,
      transfer: 61,
      accuracy: 89,
      speed: 86,
      consistency: 90,
      recentScores: [88, 90, 91, 92, 93],
      errorTags: [],
      lastPracticedAt: daysAgo(1),
      sampleSize: 12,
      goalRelevance: 0.9,
      prerequisiteTopicIds: []
    },
    {
      topicId: "probability",
      topicName: "Probability",
      mastery: 71,
      retention: 42,
      transfer: null,
      accuracy: 65,
      speed: 62,
      consistency: 55,
      recentScores: [78, 74, 69, 65, 60],
      errorTags: ["concept_recall"],
      lastPracticedAt: daysAgo(6),
      sampleSize: 9,
      goalRelevance: 0.9,
      prerequisiteTopicIds: []
    },
    {
      topicId: "time-and-work",
      topicName: "Time & Work",
      mastery: 85,
      retention: 80,
      transfer: 75,
      accuracy: 84,
      speed: 58,
      consistency: 72,
      recentScores: [80, 82, 81, 83],
      errorTags: [],
      lastPracticedAt: daysAgo(2),
      sampleSize: 10,
      goalRelevance: 0.8,
      prerequisiteTopicIds: []
    },
    {
      topicId: "averages",
      topicName: "Averages",
      mastery: 95,
      retention: 93,
      transfer: 91,
      accuracy: 97,
      speed: 94,
      consistency: 96,
      recentScores: [94, 95, 96, 95, 96],
      errorTags: [],
      lastPracticedAt: daysAgo(3),
      sampleSize: 15,
      goalRelevance: 0.7,
      prerequisiteTopicIds: []
    },
    {
      topicId: "algebra-basics",
      topicName: "Algebra Basics",
      mastery: 40,
      retention: 50,
      transfer: null,
      accuracy: 45,
      speed: 50,
      consistency: 40,
      recentScores: [46, 43, 40],
      errorTags: ["concept_error", "concept_error"],
      lastPracticedAt: daysAgo(9),
      sampleSize: 6,
      goalRelevance: 0.6,
      prerequisiteTopicIds: []
    },
    {
      topicId: "quadratic-equations",
      topicName: "Quadratic Equations",
      mastery: 50,
      retention: 65,
      transfer: null,
      accuracy: 55,
      speed: 60,
      consistency: 50,
      recentScores: [56, 53, 50],
      errorTags: [],
      lastPracticedAt: daysAgo(9),
      sampleSize: 7,
      goalRelevance: 0.5,
      prerequisiteTopicIds: ["algebra-basics"]
    },
    {
      topicId: "profit-loss",
      topicName: "Profit & Loss",
      mastery: 65,
      retention: 60,
      transfer: null,
      accuracy: 60,
      speed: 55,
      consistency: 50,
      recentScores: [65, 70],
      errorTags: [],
      lastPracticedAt: daysAgo(14),
      sampleSize: 2,
      goalRelevance: 0.6,
      prerequisiteTopicIds: []
    },
    {
      topicId: "ratio-proportion",
      topicName: "Ratio & Proportion",
      mastery: 75,
      retention: 72,
      transfer: 72,
      accuracy: 70,
      speed: 68,
      consistency: 60,
      recentScores: [70, 68, 72, 70],
      errorTags: ["careless", "method_error", "method_error", "careless", "method_error"],
      lastPracticedAt: daysAgo(4),
      sampleSize: 8,
      goalRelevance: 0.6,
      prerequisiteTopicIds: []
    }
  ];
}
