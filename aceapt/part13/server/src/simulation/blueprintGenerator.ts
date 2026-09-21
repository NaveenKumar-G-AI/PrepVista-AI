import type { AssessmentProfile, BlueprintQuestionSlot, BlueprintValidation, Difficulty } from "../domain/types.js";

export interface QuestionPoolItem {
  id: string;
  topicId: string;
  skill: string;
  difficulty: Difficulty;
  expectedTimeSeconds: number;
}

export interface GeneratedBlueprint {
  composition: BlueprintQuestionSlot[];
  selectedQuestionIds: string[]; // parallel to composition, index-for-index
  validation: BlueprintValidation;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Largest-remainder apportionment so counts always sum to exactly `total`
 * even when the target fractions don't divide evenly. */
function distributeDifficulty(total: number, dist: Record<Difficulty, number>): Record<Difficulty, number> {
  const raw = DIFFICULTIES.map((k) => total * (dist[k] ?? 0));
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - (floors[i] ?? 0) })).sort((a, b) => b.frac - a.frac);

  const result: Record<Difficulty, number> = { easy: floors[0] ?? 0, medium: floors[1] ?? 0, hard: floors[2] ?? 0 };
  let idx = 0;
  while (remainder > 0 && idx < order.length) {
    const entry = order[idx];
    if (entry) {
      const key = DIFFICULTIES[entry.i];
      if (key) result[key] += 1;
    }
    remainder -= 1;
    idx += 1;
  }
  return result;
}

function tallyDifficulty(composition: BlueprintQuestionSlot[]): Record<Difficulty, number> {
  const t: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const c of composition) t[c.difficulty] += 1;
  return t;
}

function distributionWithinTolerance(
  actual: Record<Difficulty, number>,
  target: Record<Difficulty, number>,
  total: number,
  tolerance = 0.15
): boolean {
  if (total === 0) return false;
  return DIFFICULTIES.every((k) => Math.abs(actual[k] / total - (target[k] ?? 0)) <= tolerance);
}

function pickRandom<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

/**
 * Assembles a blueprint from the question pool, preferring questions this
 * student hasn't seen before (Section 40), then validates the result rather
 * than trusting it blindly (Section 6: "Do not blindly trust generated
 * content").
 */
export function generateBlueprint(
  profile: AssessmentProfile,
  pool: QuestionPoolItem[],
  previouslySeenQuestionIds: ReadonlySet<string>
): GeneratedBlueprint {
  const composition: BlueprintQuestionSlot[] = [];
  const selectedQuestionIds: string[] = [];
  const usedInThisBlueprint = new Set<string>();
  const issues: string[] = [];

  for (const section of profile.sections) {
    const counts = distributeDifficulty(section.questionCount, profile.difficultyDistribution);
    for (const difficulty of DIFFICULTIES) {
      const need = counts[difficulty];
      for (let i = 0; i < need; i++) {
        const candidates = pool.filter(
          (q) => section.topicIds.includes(q.topicId) && q.difficulty === difficulty && !usedInThisBlueprint.has(q.id)
        );
        const novelCandidates = candidates.filter((q) => !previouslySeenQuestionIds.has(q.id));
        const chosen = pickRandom(novelCandidates.length > 0 ? novelCandidates : candidates);

        if (!chosen) {
          issues.push(
            `Not enough "${difficulty}" questions available for section "${section.name}" (topics: ${section.topicIds.join(", ")}).`
          );
          continue;
        }
        usedInThisBlueprint.add(chosen.id);
        selectedQuestionIds.push(chosen.id);
        composition.push({
          topicId: chosen.topicId,
          skill: chosen.skill,
          difficulty,
          questionType: "mcq",
          expectedTimeSeconds: chosen.expectedTimeSeconds || profile.questionTimeExpectationSeconds,
          weight: 1,
          section: section.name,
        });
      }
    }
  }

  const questionCountOk = selectedQuestionIds.length === profile.questionCount;
  const topicsRequested = new Set(profile.sections.flatMap((s) => s.topicIds));
  const topicsCovered = new Set(composition.map((c) => c.topicId));
  const topicCoverageOk = [...topicsRequested].every((t) => topicsCovered.has(t));

  const actualDist = tallyDifficulty(composition);
  const difficultyDistributionOk = distributionWithinTolerance(actualDist, profile.difficultyDistribution, composition.length);

  const totalExpectedSeconds = composition.reduce((s, c) => s + c.expectedTimeSeconds, 0);
  const timingOk = totalExpectedSeconds <= profile.durationMinutes * 60 * 1.15;

  const noveltyCount = selectedQuestionIds.filter((id) => !previouslySeenQuestionIds.has(id)).length;
  const noveltyOk =
    previouslySeenQuestionIds.size === 0 || selectedQuestionIds.length === 0
      ? true
      : noveltyCount / selectedQuestionIds.length >= 0.5;

  if (!questionCountOk) {
    issues.push(`Requested ${profile.questionCount} questions but only assembled ${selectedQuestionIds.length} — question pool may be too small.`);
  }
  if (!timingOk) {
    issues.push(
      `Expected total time (${Math.round(totalExpectedSeconds / 60)}m) exceeds the ${profile.durationMinutes}m duration by more than 15%.`
    );
  }
  if (!noveltyOk) {
    issues.push("Fewer than half the assembled questions are novel to this student — readiness confidence will be reduced.");
  }
  if (!difficultyDistributionOk) {
    issues.push("Assembled difficulty distribution deviates from the profile's target by more than 15 points.");
  }

  return {
    composition,
    selectedQuestionIds,
    validation: { questionCountOk, topicCoverageOk, difficultyDistributionOk, timingOk, noveltyOk, issues },
  };
}
