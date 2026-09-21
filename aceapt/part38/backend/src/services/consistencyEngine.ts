import { ProfileMaterialsSnapshot } from "../types/domain";
import { normalize } from "./relevanceEngine";

export type ConsistencyLabel = "consistent" | "partially-consistent" | "inconsistent";

export interface ConsistencyReport {
  label: ConsistencyLabel;
  sources: { name: string; statedFocus: string }[];
  explanation: string;
}

/**
 * Compares whatever stated-focus fields are available (spec section 42).
 * This only compares text the platform already has on file — it never
 * infers a "true" focus and never rewrites anything automatically.
 */
export function analyzeConsistency(snapshot: ProfileMaterialsSnapshot): ConsistencyReport {
  const allSources: { name: string; statedFocus?: string }[] = [
    { name: "Resume", statedFocus: snapshot.resumeStatedFocus },
    { name: "Portfolio", statedFocus: snapshot.portfolioStatedFocus },
    { name: "Introduction", statedFocus: snapshot.introductionStatedFocus },
    { name: "Interview positioning", statedFocus: snapshot.interviewStatedFocus },
  ];
  const sources = allSources.filter((s): s is { name: string; statedFocus: string } => Boolean(s.statedFocus));

  if (sources.length < 2) {
    return {
      label: "consistent",
      sources,
      explanation: "Not enough professional materials on file yet to compare.",
    };
  }

  const distinct = new Set(sources.map((s) => normalize(s.statedFocus)));

  if (distinct.size === 1) {
    return {
      label: "consistent",
      sources,
      explanation: "Your professional materials currently emphasize the same career direction.",
    };
  }

  if (distinct.size === sources.length) {
    return {
      label: "inconsistent",
      sources,
      explanation: "Your professional materials currently emphasize different career directions.",
    };
  }

  return {
    label: "partially-consistent",
    sources,
    explanation: "Most of your professional materials emphasize the same direction, but at least one does not.",
  };
}
