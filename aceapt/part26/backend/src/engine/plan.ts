import { AdaptivePlan, CandidateAction, PlanItem, TopicCapabilityState } from "../types";
import { ACTION_BASE } from "./constants";

let mixCounter = 0;

function makeMixVerification(minutes: number, topics: string[]): CandidateAction {
  mixCounter += 1;
  const impact = ACTION_BASE.MIX_VERIFICATION.baseImpact;
  return {
    id: `mixed-verification::${mixCounter}`,
    topicId: "mixed",
    topicName: topics.join(" + "),
    actionType: "MIX",
    bottleneck: "STABLE",
    severity: 0,
    estimatedMinutes: minutes,
    expectedImpact: impact,
    expectedValuePerMinute: impact / minutes,
    priorityScore: 0,
    priorityBreakdown: [],
    rationale: [`Confirms the improvements from ${topics.join(" and ")} actually held, with a short mixed check.`]
  };
}

function makeStableStretch(minutes: number, state: TopicCapabilityState): CandidateAction {
  const impact = ACTION_BASE.STABLE_STRETCH.baseImpact;
  return {
    id: `${state.topicId}::CHALLENGE`,
    topicId: state.topicId,
    topicName: state.topicName,
    actionType: "CHALLENGE",
    bottleneck: "STABLE",
    severity: 0,
    estimatedMinutes: minutes,
    expectedImpact: impact,
    expectedValuePerMinute: impact / minutes,
    priorityScore: 0,
    priorityBreakdown: [],
    rationale: [
      `Every tracked topic is currently stable - ${state.topicName} is the strongest, so it's a good stretch challenge rather than more repetition.`
    ]
  };
}

/**
 * Greedy expected-value packing into a time budget (section 12/29). Greedy
 * rather than an optimal knapsack on purpose: the ordering has to stay
 * explainable ("we picked the highest-priority thing that fits next"), not
 * just optimal in aggregate.
 *
 * When budget remains after 2+ distinct topics are addressed, appends a
 * short mixed-verification step (sections 16, 45) sized to whatever's left
 * (capped). When there is nothing to address at all (every topic stable),
 * offers a single stretch challenge on the strongest topic instead of an
 * empty plan (sections 19, 24).
 */
export function generatePlan(args: {
  studentId: string;
  totalMinutes: number;
  remainingMinutes: number;
  rankedCandidates: CandidateAction[];
  allStatesById: Map<string, TopicCapabilityState>;
}): AdaptivePlan {
  const { studentId, totalMinutes, allStatesById } = args;
  let budget = args.remainingMinutes;
  const items: PlanItem[] = [];
  const touchedTopics: string[] = [];

  for (const candidate of args.rankedCandidates) {
    if (candidate.estimatedMinutes <= budget) {
      items.push({ order: items.length + 1, action: candidate });
      touchedTopics.push(candidate.topicName);
      budget -= candidate.estimatedMinutes;
    }
    if (budget <= 0) break;
  }

  if (items.length === 0) {
    // Nothing fit. Two very different situations look the same here, and
    // the plan must not conflate them:
    if (args.rankedCandidates.length > 0) {
      // (a) There IS a real, evidence-backed priority - it just needs more
      // time than is available (e.g. a 6-minute repair with only 5 minutes
      // to spend). Section 29 says even a 5-minute request should get a
      // plan grounded in the student's actual state - so surface the real
      // top priority anyway and say so, rather than substituting an
      // unrelated filler challenge just because it happens to fit.
      const top = args.rankedCandidates[0];
      return {
        studentId,
        totalMinutes,
        remainingMinutes: Math.max(0, budget - top.estimatedMinutes),
        items: [{ order: 1, action: top }],
        unusedMinutes: 0,
        generatedAt: new Date().toISOString(),
        allStable: false,
        exceedsBudget: top.estimatedMinutes > budget
      };
    }

    // (b) There is genuinely nothing to work on - every tracked topic is
    // stable (sections 19, 24). Offer a stretch challenge instead of an
    // empty screen.
    const strongest = [...allStatesById.values()].sort((a, b) => {
      const scoreOf = (s: TopicCapabilityState) =>
        (s.mastery ?? 0) + (s.retention ?? 0) + (s.transfer ?? 0) + (s.accuracy ?? 0);
      return scoreOf(b) - scoreOf(a);
    })[0];

    if (strongest && budget > 0) {
      const minutes = Math.min(budget, ACTION_BASE.STABLE_STRETCH.maxMinutes);
      const stretch = makeStableStretch(minutes, strongest);
      items.push({ order: 1, action: stretch });
      budget -= minutes;
    }

    return {
      studentId,
      totalMinutes,
      remainingMinutes: Math.max(0, budget),
      items,
      unusedMinutes: Math.max(0, budget),
      generatedAt: new Date().toISOString(),
      allStable: true,
      exceedsBudget: false
    };
  }

  if (budget >= 3 && touchedTopics.length >= 2) {
    const minutes = Math.min(budget, ACTION_BASE.MIX_VERIFICATION.maxMinutes);
    const verification = makeMixVerification(minutes, touchedTopics.slice(0, 2));
    items.push({ order: items.length + 1, action: verification });
    budget -= minutes;
  }

  return {
    studentId,
    totalMinutes,
    remainingMinutes: Math.max(0, budget),
    items,
    unusedMinutes: Math.max(0, budget),
    generatedAt: new Date().toISOString(),
    allStable: false,
    exceedsBudget: false
  };
}
