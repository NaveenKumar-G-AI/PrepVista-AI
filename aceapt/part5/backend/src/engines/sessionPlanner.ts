import { Difficulty, MasteryState, PracticeMode, PracticeObjective, QuestionType } from "../domain/enums";
import { Skill, SkillPracticeState, SessionPlanItem } from "../domain/types";

export interface PlanResult {
  objective: PracticeObjective;
  objectiveReason: string;
  mode: PracticeMode;
  skillFocus: string[];
  startingDifficulty: Difficulty;
  plan: SessionPlanItem[];
}

/**
 * §19 — never "20 random questions." Looks at every skill the student has
 * touched (plus untouched prerequisite-satisfied skills), picks ONE
 * objective with a stated reason, and derives a concrete plan from it.
 */
export function planSession(
  skills: Skill[],
  states: Map<string, SkillPracticeState>,
  requestedMode?: PracticeMode
): PlanResult {
  const touched = skills.filter((s) => (states.get(s.id)?.attemptCount ?? 0) > 0);
  const untouched = skills.filter((s) => (states.get(s.id)?.attemptCount ?? 0) === 0);

  // Rank touched skills by weakness (lower recentAccuracy = weaker), but skip
  // ones already fully mastered from consideration as a "weakness".
  const weaknessRanked = [...touched]
    .filter((s) => states.get(s.id)!.masteryState !== MasteryState.VERIFIED_MASTERY)
    .sort((a, b) => states.get(a.id)!.recentAccuracy - states.get(b.id)!.recentAccuracy);

  // No history at all yet → build foundation on the first prerequisite-free skill.
  if (touched.length === 0) {
    const first = untouched.find((s) => s.prerequisites.length === 0) ?? skills[0];
    return {
      objective: PracticeObjective.BUILD_FOUNDATION,
      objectiveReason: `No practice history yet for ${first.name} — starting with the fundamentals.`,
      mode: requestedMode ?? PracticeMode.LEARN_AND_PRACTICE,
      skillFocus: [first.id],
      startingDifficulty: Difficulty.EASY,
      plan: [
        { questionType: QuestionType.CONCEPT_CHECK, count: 3, skillFocus: first.id },
        { questionType: QuestionType.GUIDED_PRACTICE, count: 3, skillFocus: first.id },
        { questionType: QuestionType.STANDARD_PRACTICE, count: 2, skillFocus: first.id },
      ],
    };
  }

  const weakest = weaknessRanked[0];

  // Everything touched is already at VERIFIED_MASTERY → maintain, or introduce next untouched skill.
  if (!weakest) {
    const next = untouched.find((s) => s.prerequisites.every((p) => states.get(p)?.masteryState === MasteryState.VERIFIED_MASTERY));
    if (next) {
      return {
        objective: PracticeObjective.BUILD_FOUNDATION,
        objectiveReason: `${touched.map((t) => t.name).join(", ")} ${touched.length > 1 ? "are" : "is"} solid — moving on to ${next.name}.`,
        mode: requestedMode ?? PracticeMode.LEARN_AND_PRACTICE,
        skillFocus: [next.id],
        startingDifficulty: Difficulty.EASY,
        plan: [
          { questionType: QuestionType.CONCEPT_CHECK, count: 2, skillFocus: next.id },
          { questionType: QuestionType.GUIDED_PRACTICE, count: 3, skillFocus: next.id },
          { questionType: QuestionType.STANDARD_PRACTICE, count: 3, skillFocus: next.id },
        ],
      };
    }
    return {
      objective: PracticeObjective.MAINTAIN_SKILL,
      objectiveReason: "Everything in scope is at verified mastery — a light mixed session to keep it fresh.",
      mode: PracticeMode.MIXED_PRACTICE,
      skillFocus: touched.map((t) => t.id),
      startingDifficulty: Difficulty.MEDIUM,
      plan: [{ questionType: QuestionType.MIXED, count: 8 }],
    };
  }

  const weakestState = states.get(weakest.id)!;
  const strongSkill = [...touched].sort((a, b) => states.get(b.id)!.recentAccuracy - states.get(a.id)!.recentAccuracy)[0];
  const strongState = strongSkill ? states.get(strongSkill.id)! : undefined;

  // Weak accuracy on foundational recall itself → repair the gap directly.
  if (weakestState.recentAccuracy < 0.5) {
    return {
      objective: PracticeObjective.REPAIR_GAP,
      objectiveReason: `Recent accuracy on ${weakest.name} is ${Math.round(weakestState.recentAccuracy * 100)}% — repairing this gap before building further on top of it.`,
      mode: requestedMode ?? PracticeMode.WEAKNESS_REPAIR,
      skillFocus: [weakest.id],
      startingDifficulty: clampStart(weakestState.currentDifficulty, -1),
      plan: [
        { questionType: QuestionType.CONCEPT_CHECK, count: 2, skillFocus: weakest.id },
        { questionType: QuestionType.GUIDED_PRACTICE, count: 4, skillFocus: weakest.id },
        { questionType: QuestionType.STANDARD_PRACTICE, count: 2, skillFocus: weakest.id },
      ],
    };
  }

  // Foundation strong, application/transfer skill inconsistent → the exact §19 example scenario.
  if (strongState && strongState.recentAccuracy - weakestState.recentAccuracy >= 0.25) {
    return {
      objective: PracticeObjective.IMPROVE_ACCURACY,
      objectiveReason: `Basic accuracy is strong (${strongSkill!.name}: ${Math.round(strongState.recentAccuracy * 100)}%) but ${weakest.name.toLowerCase()} performance is inconsistent (${Math.round(weakestState.recentAccuracy * 100)}%).`,
      mode: requestedMode ?? PracticeMode.MASTERY_BUILDER,
      skillFocus: [weakest.id],
      startingDifficulty: weakestState.currentDifficulty,
      plan: [
        { questionType: QuestionType.CONCEPT_CHECK, count: 3, skillFocus: weakest.id },
        { questionType: QuestionType.APPLICATION, count: 4, skillFocus: weakest.id },
        { questionType: QuestionType.TRANSFER, count: 3, skillFocus: weakest.id },
        { questionType: QuestionType.SPEED, count: 2, skillFocus: weakest.id },
        { questionType: QuestionType.CHALLENGE, count: 1, skillFocus: weakest.id },
      ],
    };
  }

  // Accuracy is fine but this skill is consistently slow → speed work.
  const slowRelativeToExpectation = weakestState.averageTimeSeconds > 0 && weakestState.recentAccuracy >= 0.7;
  if (slowRelativeToExpectation && weakestState.masteryState !== MasteryState.NOT_STARTED) {
    return {
      objective: PracticeObjective.IMPROVE_SPEED,
      objectiveReason: `${weakest.name} accuracy is solid but noticeably slow — building fluency under light time pressure.`,
      mode: requestedMode ?? PracticeMode.MASTERY_BUILDER,
      skillFocus: [weakest.id],
      startingDifficulty: weakestState.currentDifficulty,
      plan: [
        { questionType: QuestionType.STANDARD_PRACTICE, count: 3, skillFocus: weakest.id },
        { questionType: QuestionType.SPEED, count: 5, skillFocus: weakest.id },
        { questionType: QuestionType.CHALLENGE, count: 2, skillFocus: weakest.id },
      ],
    };
  }

  // Default: keep building mastery on the current weakest-but-not-terrible skill.
  return {
    objective: PracticeObjective.VERIFY_MASTERY,
    objectiveReason: `${weakest.name} performance has been solid recently — checking whether that mastery holds up under variation.`,
    mode: requestedMode ?? PracticeMode.MASTERY_BUILDER,
    skillFocus: [weakest.id],
    startingDifficulty: weakestState.currentDifficulty,
    plan: [
      { questionType: QuestionType.STANDARD_PRACTICE, count: 2, skillFocus: weakest.id },
      { questionType: QuestionType.APPLICATION, count: 2, skillFocus: weakest.id },
      { questionType: QuestionType.TRANSFER, count: 2, skillFocus: weakest.id },
      { questionType: QuestionType.SPEED, count: 2, skillFocus: weakest.id },
    ],
  };
}

function clampStart(level: Difficulty, delta: number): Difficulty {
  return Math.max(Difficulty.FOUNDATION, Math.min(Difficulty.EXPERT, level + delta)) as Difficulty;
}
