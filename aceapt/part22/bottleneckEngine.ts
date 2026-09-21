import { Bottleneck, GapAnalysis, PrimaryBottleneck, Skill, SkillState, StudentState } from "../types";

interface BottleneckEngineInput {
  skills: Skill[];
  state: StudentState;
  goalWeightBySkill?: Record<string, number>; // how much each skill matters to the active goal
}

function downstreamOf(skillId: string, skills: Skill[]): string[] {
  const direct = skills.filter((s) => s.prerequisiteSkillIds.includes(skillId)).map((s) => s.skillId);
  const transitive = direct.flatMap((id) => downstreamOf(id, skills));
  return Array.from(new Set([...direct, ...transitive]));
}

function weaknessSeverity(skillState: SkillState | undefined): number {
  if (!skillState) return 0;
  const values = [skillState.mastery.value, skillState.transfer.value, skillState.timedAccuracy.value].filter(
    (v): v is number => v !== null
  );
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.max(0, Math.min(1, (75 - avg) / 75)); // 0 = fine, 1 = very weak
}

/**
 * Section 13: "A weakness is not automatically a bottleneck." Note the
 * formula's shape: prerequisiteImpact and goalRelevance are gated behind
 * severity (multiplied, not just added) — otherwise a skill that is barely
 * weak but happens to sit upstream of several others could outrank a skill
 * that is genuinely failing, which would make "priority" feel arbitrary to
 * a student. improvementPotential is added on top as a small, separate
 * signal for "how much headroom fixing this unlocks."
 */
export function detectBottlenecks(input: BottleneckEngineInput): Bottleneck[] {
  const { skills, state, goalWeightBySkill = {} } = input;

  const bottlenecks: Bottleneck[] = skills.map((skill) => {
    const skillState = state.skills[skill.skillId];
    const severity = weaknessSeverity(skillState);
    const downstream = downstreamOf(skill.skillId, skills);
    const prerequisiteImpact = Math.min(1, downstream.length / Math.max(1, skills.length - 1));
    const goalRelevance = goalWeightBySkill[skill.skillId] ?? 0.5;
    const improvementPotential = severity > 0 ? Math.min(1, severity + prerequisiteImpact * 0.3) : 0;

    const impactIfWeak = prerequisiteImpact * 0.6 + goalRelevance * 0.4; // 0..1, "how much it'd matter if it were weak"
    const score = severity * impactIfWeak + improvementPotential * 0.15;

    const downstreamNames = downstream
      .map((id) => skills.find((s) => s.skillId === id)?.name ?? id)
      .join(", ");

    const reason =
      severity === 0
        ? `${skill.name} is currently stable — no repair needed.`
        : downstream.length > 0
        ? `${skill.name} is weak and sits upstream of ${downstream.length} other skill${downstream.length === 1 ? "" : "s"} (${downstreamNames}), so repairing it has compounding value.`
        : `${skill.name} is weak but relatively isolated — repairing it mainly helps ${skill.name} itself.`;

    return {
      skillId: skill.skillId,
      skillName: skill.name,
      severity,
      prerequisiteImpact,
      goalRelevance,
      improvementPotential,
      score,
      affectedDownstreamSkillIds: downstream,
      reason,
    };
  });

  return bottlenecks.filter((b) => b.severity > 0).sort((a, b) => b.score - a.score);
}

const METRIC_LABELS: Record<string, string> = {
  mastery: "Mastery",
  retention: "Retention",
  transfer: "Transfer",
  reasoning: "Reasoning",
  accuracy: "Accuracy",
  speed: "Timed Performance",
  questionSelection: "Question Selection",
  simulationPerformance: "Simulation Performance",
  consistency: "Consistency",
  readiness: "Readiness",
};

function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? capitalize(metric);
}

const COMBO_PHRASES: Array<{ primary: string; secondary: string; label: string }> = [
  { primary: "transfer", secondary: "speed", label: "Transfer under time pressure" },
  { primary: "questionSelection", secondary: "speed", label: "Question selection under time pressure" },
  { primary: "transfer", secondary: "questionSelection", label: "Transfer in unfamiliar question formats" },
  { primary: "mastery", secondary: "retention", label: "Retention of otherwise-mastered material" },
  { primary: "speed", secondary: "simulationPerformance", label: "Timed execution under full simulation conditions" },
];

/**
 * Sections 12 & 27-28: produces the single, plain-language "biggest
 * bottleneck" a student sees (e.g. "Transfer under time pressure") by
 * looking at which two capability gaps are largest together, falling back
 * to a single-metric description when there's no clean combination.
 */
export function derivePrimaryBottleneck(
  gaps: GapAnalysis[],
  skillBottlenecks: Bottleneck[]
): PrimaryBottleneck {
  const ranked = [...gaps]
    .filter((g) => g.status === "GAP")
    .sort((a, b) => Math.abs((b.delta ?? 0) * b.weight) - Math.abs((a.delta ?? 0) * a.weight));

  const topSkill = skillBottlenecks[0];

  if (ranked.length === 0) {
    return {
      label: "No active gap — current focus is maintenance",
      reason: "Every tracked capability is at or above its target for this goal.",
      relatedMetrics: [],
    };
  }

  const top = ranked[0];
  const second = ranked[1];

  const combo = second
    ? COMBO_PHRASES.find(
        (c) =>
          (c.primary === top.metric && c.secondary === second.metric) ||
          (c.primary === second.metric && c.secondary === top.metric)
      )
    : undefined;

  if (combo) {
    return {
      label: combo.label,
      reason: `Your ${metricLabel(String(top.metric)).toLowerCase()} is meaningfully below target (${top.current ?? "no evidence"} vs ${top.target}), and ${metricLabel(String(second!.metric)).toLowerCase()} is a compounding factor — the two together are limiting real performance more than either alone.`,
      relatedSkillId: topSkill?.skillId,
      relatedMetrics: [top.metric, second!.metric],
    };
  }

  return {
    label: `${metricLabel(String(top.metric))} is your current limiting factor`,
    reason: `${metricLabel(String(top.metric))} is ${Math.abs(top.delta ?? 0)} points below target and carries the largest weighted gap right now.`,
    relatedSkillId: topSkill?.skillId,
    relatedMetrics: [top.metric],
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
