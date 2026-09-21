import type { DifficultyBoundary, QuestionDifficulty } from "../types/domain.js";

const DIFFICULTY_ORDER: QuestionDifficulty[] = ["easy", "medium", "hard", "very_hard"];
const MIN_PER_BAND = 2; // one lucky/unlucky question shouldn't define a band
const BOUNDARY_DROP_THRESHOLD = 0.35;

export interface DifficultyResponsePoint {
  difficulty: QuestionDifficulty;
  isCorrect: boolean;
}

/**
 * Module 17: "Easy → 95%, Medium → 82%, Hard → 41%" is more valuable than
 * "Quant score = 73%." This finds where, if anywhere, accuracy actually
 * breaks down across the difficulty ladder.
 */
export function computeDifficultyProfile(scopeNodeId: string, responses: DifficultyResponsePoint[]): DifficultyBoundary {
  const accuracyByDifficulty: Partial<Record<QuestionDifficulty, number>> = {};

  for (const band of DIFFICULTY_ORDER) {
    const subset = responses.filter((r) => r.difficulty === band);
    if (subset.length >= MIN_PER_BAND) {
      accuracyByDifficulty[band] = Number((subset.filter((r) => r.isCorrect).length / subset.length).toFixed(2));
    }
  }

  const present = DIFFICULTY_ORDER.filter((b) => accuracyByDifficulty[b] !== undefined);
  let boundaryDetected = false;
  let interpretation = "Not enough spread across difficulty levels yet to identify a clear breakdown point.";

  for (let i = 0; i < present.length - 1; i++) {
    const lowerBand = present[i]!;
    const higherBand = present[i + 1]!;
    const drop = accuracyByDifficulty[lowerBand]! - accuracyByDifficulty[higherBand]!;
    if (drop >= BOUNDARY_DROP_THRESHOLD) {
      boundaryDetected = true;
      interpretation =
        `Performance is strong on ${lowerBand.replace("_", " ")} questions but drops noticeably on ` +
        `${higherBand.replace("_", " ")} questions — foundational capability looks solid here, but application ` +
        `at higher difficulty needs development.`;
      break;
    }
  }

  if (!boundaryDetected && present.length >= 2) {
    interpretation = "Performance holds fairly steady across the difficulty levels answered so far.";
  }

  return { domainOrTopicNodeId: scopeNodeId, accuracyByDifficulty, boundaryDetected, interpretation };
}
